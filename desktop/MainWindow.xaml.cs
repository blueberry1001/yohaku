using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace Yohaku.Desktop;

public partial class MainWindow : Window
{
    private readonly string _appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Yohaku");
    private LibraryDatabase? _database;
    private string PreferencePath => Path.Combine(_appData, "last-database.txt");
    internal static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Closed += (_, _) => { Browser.Dispose(); _database?.Dispose(); };
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            Directory.CreateDirectory(_appData);
            var defaultPath = Path.Combine(_appData, "library.db");
            var savedPath = File.Exists(PreferencePath) ? File.ReadAllText(PreferencePath).Trim() : defaultPath;
            var selectedPath = File.Exists(savedPath) ? savedPath : defaultPath;
            _database = new LibraryDatabase(selectedPath, create: !File.Exists(selectedPath));
            var contentPath = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            if (!File.Exists(Path.Combine(contentPath, "index.html"))) throw new InvalidOperationException("画面ファイルがありません。配布 ZIP をフォルダーごと展開してください。");
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(_appData, "WebView2"));
            await Browser.EnsureCoreWebView2Async(environment);
            Browser.CoreWebView2.SetVirtualHostNameToFolderMapping("yohaku.local", contentPath, CoreWebView2HostResourceAccessKind.Deny);
            var settings = Browser.CoreWebView2.Settings;
            settings.AreHostObjectsAllowed = false;
            settings.AreDevToolsEnabled = false;
            settings.AreDefaultContextMenusEnabled = false;
            settings.IsStatusBarEnabled = false;
            settings.IsPasswordAutosaveEnabled = false;
            settings.IsGeneralAutofillEnabled = false;
            await Browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("window.__YOHAKU_DESKTOP__ = location.origin === 'https://yohaku.local';");
            Browser.CoreWebView2.NavigationStarting += (_, args) =>
            {
                if (IsTrusted(args.Uri)) return;
                args.Cancel = true;
                OpenExternal(args.Uri);
            };
            Browser.CoreWebView2.NewWindowRequested += (_, args) => { args.Handled = true; OpenExternal(args.Uri); };
            Browser.CoreWebView2.PermissionRequested += (_, args) => args.State = CoreWebView2PermissionState.Deny;
            Browser.CoreWebView2.WebMessageReceived += OnWebMessage;
            Browser.CoreWebView2.Navigate("https://yohaku.local/index.html");
        }
        catch (Exception error)
        {
            MessageBox.Show(this, $"余白を起動できませんでした。\n\n{error.Message}\n\nWebView2 Runtime がない場合は Microsoft の公式サイトからインストールしてください。", "余白", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private static bool IsTrusted(string value) => Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https" && uri.Host == "yohaku.local" && uri.IsDefaultPort && string.IsNullOrEmpty(uri.UserInfo);

    private static void OpenExternal(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || (uri.Scheme != "https" && uri.Scheme != "http") || !string.IsNullOrEmpty(uri.UserInfo)) return;
        try { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); }
        catch { /* The user's OS may not have a default browser configured. */ }
    }

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (!IsTrusted(args.Source) || _database is null) return;
        string? requestId = null;
        try
        {
            var json = args.WebMessageAsJson;
            if (System.Text.Encoding.UTF8.GetByteCount(json) > 5 * 1024 * 1024) throw new InvalidOperationException("取り込む JSON は 5 MB 以下にしてください。");
            using var message = JsonDocument.Parse(json);
            var root = message.RootElement;
            requestId = root.GetProperty("id").GetString();
            if (!Guid.TryParse(requestId, out _)) return;
            var action = root.GetProperty("action").GetString();
            var payload = root.GetProperty("payload");
            object? result = action switch
            {
                "load" => _database.Load(),
                "createArtwork" => _database.CreateArtwork(payload),
                "updateArtwork" => _database.UpdateArtwork(payload),
                "deleteArtwork" => _database.DeleteArtwork(payload),
                "addComment" => _database.AddComment(payload),
                "deleteComment" => _database.DeleteComment(payload),
                "importLibrary" => _database.ImportLibrary(payload),
                "databaseInfo" => DatabaseInfo(),
                "openDatabase" => SelectDatabase(false),
                "createDatabase" => SelectDatabase(true),
                "saveDatabaseAs" => SaveDatabaseAs(),
                _ => throw new InvalidOperationException("未対応の操作です。")
            };
            Browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { id = requestId, result }, JsonOptions));
        }
        catch (Exception error)
        {
            if (requestId is not null)
                Browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { id = requestId, error = error is JsonException or KeyNotFoundException ? "データの形式が正しくありません。" : error.Message }, JsonOptions));
        }
    }

    private object DatabaseInfo() => new { name = Path.GetFileName(_database!.DatabasePath), path = _database.DatabasePath };
    private object DatabaseResult() => new { artworks = _database!.Load().Artworks, comments = _database.Load().Comments, name = Path.GetFileName(_database.DatabasePath), path = _database.DatabasePath };

    private object? SelectDatabase(bool create)
    {
        FileDialog dialog = create
            ? new SaveFileDialog { Title = "新しい余白データベース", FileName = "余白.db", OverwritePrompt = true }
            : new OpenFileDialog { Title = "余白データベースを開く", CheckFileExists = true };
        dialog.Filter = "余白 SQLite データベース (*.db)|*.db";
        dialog.DefaultExt = ".db";
        if (dialog.ShowDialog(this) != true) return null;
        if (create && File.Exists(dialog.FileName)) throw new InvalidOperationException("新しいデータベースには、まだ存在しないファイル名を選んでください。");
        var next = new LibraryDatabase(dialog.FileName, create);
        SwitchDatabase(next);
        return DatabaseResult();
    }

    private object? SaveDatabaseAs()
    {
        var dialog = new SaveFileDialog { Title = "データベースに別名を付けて保存", FileName = Path.GetFileNameWithoutExtension(_database!.DatabasePath) + "-copy.db", Filter = "余白 SQLite データベース (*.db)|*.db", DefaultExt = ".db", OverwritePrompt = true };
        if (dialog.ShowDialog(this) != true) return null;
        if (string.Equals(Path.GetFullPath(dialog.FileName), _database.DatabasePath, StringComparison.OrdinalIgnoreCase)) return DatabaseResult();
        _database.BackupTo(dialog.FileName);
        SwitchDatabase(new LibraryDatabase(dialog.FileName, false));
        return DatabaseResult();
    }

    private void SwitchDatabase(LibraryDatabase next)
    {
        var previous = _database;
        _database = next;
        previous?.Dispose();
        File.WriteAllText(PreferencePath, next.DatabasePath);
        Title = $"余白 — {Path.GetFileName(next.DatabasePath)}";
    }
}
