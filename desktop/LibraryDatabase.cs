using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;

namespace Yohaku.Desktop;

public sealed class Artwork
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Url { get; set; } = "";
    public string Creator { get; set; } = "";
    public string Kind { get; set; } = "illustration";
    public string[] Tags { get; set; } = [];
    public string Description { get; set; } = "";
    public string Notes { get; set; } = "";
    public string Collection { get; set; } = "";
    public bool Favorite { get; set; }
    public string Status { get; set; } = "inbox";
    public string? ImageUrl { get; set; }
    public double PositionX { get; set; }
    public double PositionY { get; set; }
    public string CreatedAt { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
    public string CreatedBy { get; set; } = "local";
    public int Revision { get; set; } = 1;
}

public sealed class LibraryComment
{
    public string Id { get; set; } = "";
    public string ArtworkId { get; set; } = "";
    public string Body { get; set; } = "";
    public string AuthorId { get; set; } = "local";
    public string AuthorName { get; set; } = "自分";
    public string CreatedAt { get; set; } = "";
}

public sealed record LibraryState(List<Artwork> Artworks, List<LibraryComment> Comments);

/// <summary>SQLite is the durable source of truth. Every write is parameterized and committed before returning.</summary>
public sealed class LibraryDatabase : IDisposable
{
    private readonly SqliteConnection _connection;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> PatchKeys = ["title", "url", "creator", "kind", "tags", "description", "notes", "collection", "favorite", "status", "imageUrl", "positionX", "positionY"];
    public string DatabasePath { get; }

    public LibraryDatabase(string path, bool create)
    {
        DatabasePath = Path.GetFullPath(path);
        if (create && File.Exists(DatabasePath)) throw new InvalidOperationException("既存ファイルを新規データベースで上書きすることはできません。");
        if (!create && (!File.Exists(DatabasePath) || new FileInfo(DatabasePath).Length > 100_000_000)) throw new InvalidOperationException("データベースが見つからないか、サイズが 100 MB を超えています。");
        _connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = DatabasePath, Mode = create ? SqliteOpenMode.ReadWriteCreate : SqliteOpenMode.ReadWrite, Pooling = false, DefaultTimeout = 5 }.ToString());
        try
        {
            _connection.Open();
            if (create)
            {
                var assembly = Assembly.GetExecutingAssembly();
                var resource = assembly.GetManifestResourceNames().Single(name => name.EndsWith("schema.sqlite.sql", StringComparison.Ordinal));
                using var stream = assembly.GetManifestResourceStream(resource)!;
                using var reader = new StreamReader(stream);
                Execute(reader.ReadToEnd());
            }
            if (ScalarLong("PRAGMA application_id") != 1498372161 || ScalarLong("PRAGMA user_version") != 1)
                throw new InvalidOperationException("このファイルは対応する余白データベースではありません。元のファイルは変更していません。");
            using var check = Command("PRAGMA quick_check");
            if (!string.Equals(check.ExecuteScalar()?.ToString(), "ok", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("データベースが破損しています。バックアップを開いてください。");
            // A single portable .db file must contain all committed data, without a WAL sidecar.
            Execute("PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
            _ = Load();
        }
        catch { _connection.Dispose(); throw; }
    }

    private SqliteCommand Command(string sql, SqliteTransaction? transaction = null)
    {
        var command = _connection.CreateCommand();
        command.CommandText = sql;
        command.Transaction = transaction;
        return command;
    }
    private void Execute(string sql) { using var command = Command(sql); command.ExecuteNonQuery(); }
    private long ScalarLong(string sql) { using var command = Command(sql); return Convert.ToInt64(command.ExecuteScalar()); }
    private static string Now() => DateTimeOffset.UtcNow.ToString("O");
    private static void Add(SqliteCommand command, string name, object? value) => command.Parameters.AddWithValue(name, value ?? DBNull.Value);

    public LibraryState Load()
    {
        var artworks = new List<Artwork>();
        var comments = new List<LibraryComment>();
        using (var command = Command("SELECT * FROM artworks ORDER BY created_at DESC"))
        using (var reader = command.ExecuteReader())
            while (reader.Read()) artworks.Add(ReadArtwork(reader));
        using (var command = Command("SELECT * FROM comments ORDER BY created_at ASC"))
        using (var reader = command.ExecuteReader())
            while (reader.Read()) comments.Add(new LibraryComment { Id = reader.GetString(reader.GetOrdinal("id")), ArtworkId = reader.GetString(reader.GetOrdinal("artwork_id")), Body = reader.GetString(reader.GetOrdinal("body")), AuthorId = reader.GetString(reader.GetOrdinal("author_id")), AuthorName = reader.GetString(reader.GetOrdinal("author_name")), CreatedAt = reader.GetString(reader.GetOrdinal("created_at")) });
        return new LibraryState(artworks, comments);
    }

    private static Artwork ReadArtwork(SqliteDataReader reader)
    {
        string Text(string name) => reader.GetString(reader.GetOrdinal(name));
        return new Artwork
        {
            Id = Text("id"), Title = Text("title"), Url = Text("url"), Creator = Text("creator"), Kind = Text("kind"), Tags = JsonSerializer.Deserialize<string[]>(Text("tags")) ?? [], Description = Text("description"), Notes = Text("notes"), Collection = Text("collection"), Favorite = reader.GetInt64(reader.GetOrdinal("favorite")) == 1, Status = Text("status"),
            ImageUrl = reader.IsDBNull(reader.GetOrdinal("image_url")) ? null : Text("image_url"), PositionX = reader.GetDouble(reader.GetOrdinal("position_x")), PositionY = reader.GetDouble(reader.GetOrdinal("position_y")), CreatedAt = Text("created_at"), UpdatedAt = Text("updated_at"), CreatedBy = Text("created_by"), Revision = reader.GetInt32(reader.GetOrdinal("revision"))
        };
    }

    private Artwork FindArtwork(string id, SqliteTransaction? transaction = null)
    {
        using var command = Command("SELECT * FROM artworks WHERE id=$id", transaction);
        Add(command, "$id", id);
        using var reader = command.ExecuteReader();
        if (!reader.Read()) throw new InvalidOperationException("作品が見つかりません。再読み込みしてください。");
        return ReadArtwork(reader);
    }

    public Artwork CreateArtwork(JsonElement draft)
    {
        var artwork = draft.Deserialize<Artwork>(JsonOptions) ?? throw new InvalidOperationException("作品データがありません。");
        Validate(artwork);
        artwork.Id = Guid.NewGuid().ToString();
        artwork.CreatedAt = artwork.UpdatedAt = Now();
        artwork.CreatedBy = "local";
        artwork.Revision = 1;
        InsertArtwork(artwork);
        return artwork;
    }

    public Artwork UpdateArtwork(JsonElement payload)
    {
        var id = RequiredString(payload, "id");
        var expected = payload.GetProperty("expectedRevision").GetInt32();
        var patch = payload.GetProperty("patch");
        if (patch.ValueKind != JsonValueKind.Object) throw new InvalidOperationException("変更データが正しくありません。");
        using var transaction = _connection.BeginTransaction();
        var artwork = FindArtwork(id, transaction);
        if (artwork.Revision != expected) throw Conflict();
        var document = JsonSerializer.SerializeToNode(artwork, JsonOptions)!.AsObject();
        foreach (var property in patch.EnumerateObject())
        {
            if (!PatchKeys.Contains(property.Name)) throw new InvalidOperationException("変更できない項目が含まれています。");
            document[property.Name] = JsonNode.Parse(property.Value.GetRawText());
        }
        artwork = document.Deserialize<Artwork>(JsonOptions)!;
        Validate(artwork);
        artwork.UpdatedAt = Now();
        artwork.Revision++;
        using var command = Command("""
            UPDATE artworks SET title=$title,url=$url,creator=$creator,kind=$kind,tags=$tags,description=$description,notes=$notes,collection=$collection,favorite=$favorite,status=$status,image_url=$image_url,position_x=$position_x,position_y=$position_y,updated_at=$updated_at,revision=$revision WHERE id=$id AND revision=$expected
            """, transaction);
        BindArtwork(command, artwork);
        Add(command, "$expected", expected);
        if (command.ExecuteNonQuery() != 1) throw Conflict();
        transaction.Commit();
        return artwork;
    }

    public object? DeleteArtwork(JsonElement payload)
    {
        using var command = Command("DELETE FROM artworks WHERE id=$id AND revision=$revision");
        Add(command, "$id", RequiredString(payload, "id"));
        Add(command, "$revision", payload.GetProperty("expectedRevision").GetInt32());
        if (command.ExecuteNonQuery() != 1) throw Conflict();
        return null;
    }

    public LibraryComment AddComment(JsonElement payload)
    {
        var body = RequiredString(payload, "body").Trim();
        if (body.Length is 0 or > 5_000) throw new InvalidOperationException("コメントは 1〜5,000 文字で入力してください。");
        var comment = new LibraryComment { Id = Guid.NewGuid().ToString(), ArtworkId = RequiredString(payload, "artworkId"), Body = body, CreatedAt = Now() };
        _ = FindArtwork(comment.ArtworkId);
        InsertComment(comment);
        return comment;
    }

    public object? DeleteComment(JsonElement payload)
    {
        using var command = Command("DELETE FROM comments WHERE id=$id");
        Add(command, "$id", RequiredString(payload, "id"));
        command.ExecuteNonQuery();
        return null;
    }

    public object ImportLibrary(JsonElement payload)
    {
        var library = payload.Deserialize<LibraryState>(JsonOptions) ?? throw new InvalidOperationException("取り込むデータがありません。");
        if (library.Artworks is null || library.Comments is null || library.Artworks.Count > 5_000 || library.Comments.Count > 20_000) throw new InvalidOperationException("取り込み可能な件数を超えています。");
        var mapping = new Dictionary<string, string>();
        foreach (var artwork in library.Artworks)
        {
            Validate(artwork);
            if (string.IsNullOrWhiteSpace(artwork.Id) || !mapping.TryAdd(artwork.Id, Guid.NewGuid().ToString())) throw new InvalidOperationException("作品 ID が重複しているか、空です。");
        }
        foreach (var comment in library.Comments)
            if (!mapping.ContainsKey(comment.ArtworkId) || string.IsNullOrWhiteSpace(comment.Body) || comment.Body.Length > 5_000) throw new InvalidOperationException("コメントの内容または作品 ID が正しくありません。");
        using var transaction = _connection.BeginTransaction();
        foreach (var artwork in library.Artworks)
        {
            artwork.Id = mapping[artwork.Id];
            artwork.CreatedAt = artwork.UpdatedAt = Now();
            artwork.CreatedBy = "local";
            artwork.Revision = 1;
            InsertArtwork(artwork, transaction);
        }
        foreach (var comment in library.Comments)
        {
            comment.Id = Guid.NewGuid().ToString();
            comment.ArtworkId = mapping[comment.ArtworkId];
            comment.AuthorId = "local";
            comment.AuthorName = string.IsNullOrWhiteSpace(comment.AuthorName) ? "自分" : comment.AuthorName[..Math.Min(comment.AuthorName.Length, 100)];
            comment.CreatedAt = Now();
            InsertComment(comment, transaction);
        }
        transaction.Commit();
        return new { count = library.Artworks.Count };
    }

    private void InsertArtwork(Artwork artwork, SqliteTransaction? transaction = null)
    {
        using var command = Command("""
            INSERT INTO artworks(id,title,url,creator,kind,tags,description,notes,collection,favorite,status,image_url,position_x,position_y,created_at,updated_at,created_by,revision) VALUES($id,$title,$url,$creator,$kind,$tags,$description,$notes,$collection,$favorite,$status,$image_url,$position_x,$position_y,$created_at,$updated_at,$created_by,$revision)
            """, transaction);
        BindArtwork(command, artwork);
        command.ExecuteNonQuery();
    }

    private static void BindArtwork(SqliteCommand command, Artwork artwork)
    {
        Add(command, "$id", artwork.Id); Add(command, "$title", artwork.Title); Add(command, "$url", artwork.Url); Add(command, "$creator", artwork.Creator); Add(command, "$kind", artwork.Kind); Add(command, "$tags", JsonSerializer.Serialize(artwork.Tags)); Add(command, "$description", artwork.Description); Add(command, "$notes", artwork.Notes); Add(command, "$collection", artwork.Collection); Add(command, "$favorite", artwork.Favorite ? 1 : 0); Add(command, "$status", artwork.Status); Add(command, "$image_url", artwork.ImageUrl); Add(command, "$position_x", artwork.PositionX); Add(command, "$position_y", artwork.PositionY); Add(command, "$created_at", artwork.CreatedAt); Add(command, "$updated_at", artwork.UpdatedAt); Add(command, "$created_by", artwork.CreatedBy); Add(command, "$revision", artwork.Revision);
    }

    private void InsertComment(LibraryComment comment, SqliteTransaction? transaction = null)
    {
        using var command = Command("INSERT INTO comments(id,artwork_id,body,author_id,author_name,created_at) VALUES($id,$artwork_id,$body,$author_id,$author_name,$created_at)", transaction);
        Add(command, "$id", comment.Id); Add(command, "$artwork_id", comment.ArtworkId); Add(command, "$body", comment.Body); Add(command, "$author_id", comment.AuthorId); Add(command, "$author_name", comment.AuthorName); Add(command, "$created_at", comment.CreatedAt);
        command.ExecuteNonQuery();
    }

    private static void Validate(Artwork artwork)
    {
        if (string.IsNullOrWhiteSpace(artwork.Title) || artwork.Title.Length > 200) throw new InvalidOperationException("タイトルは 1〜200 文字で入力してください。");
        if (!IsWebUrl(artwork.Url)) throw new InvalidOperationException("作品 URL は http または https のリンクを指定してください。");
        if (artwork.ImageUrl is not null && artwork.ImageUrl.Length > 0 && !IsWebUrl(artwork.ImageUrl)) throw new InvalidOperationException("画像 URL は http または https のリンクを指定してください。");
        if (artwork.Kind is not ("illustration" or "video" or "photo" or "design") || artwork.Status is not ("inbox" or "reviewing" or "reviewed")) throw new InvalidOperationException("作品の種類または状態が正しくありません。");
        if (artwork.Tags is null || artwork.Tags.Length > 30 || artwork.Tags.Any(tag => string.IsNullOrWhiteSpace(tag) || tag.Length > 60)) throw new InvalidOperationException("タグは 1 件 60 文字以内、30 件までです。");
        if (artwork.Creator is null || artwork.Creator.Length > 200 || artwork.Description is null || artwork.Description.Length > 5_000 || artwork.Notes is null || artwork.Notes.Length > 20_000 || artwork.Collection is null || artwork.Collection.Length > 100) throw new InvalidOperationException("テキストが長すぎるか、入力形式が正しくありません。");
        if (!double.IsFinite(artwork.PositionX) || !double.IsFinite(artwork.PositionY) || Math.Abs(artwork.PositionX) > 100_000 || Math.Abs(artwork.PositionY) > 100_000) throw new InvalidOperationException("キャンバス上の位置が正しくありません。");
        artwork.Title = artwork.Title.Trim();
        artwork.Tags = artwork.Tags.Select(tag => tag.Trim()).Distinct().ToArray();
    }

    private static bool IsWebUrl(string? value) => value is not null && value.Length <= 4096 && Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" && string.IsNullOrEmpty(uri.UserInfo);
    private static string RequiredString(JsonElement element, string key) => element.GetProperty(key).GetString() ?? throw new InvalidOperationException("必要な文字列がありません。");
    private static InvalidOperationException Conflict() => new("別の操作でこの作品が更新されました。再読み込みしてから編集してください。");

    public void BackupTo(string targetPath)
    {
        var fullPath = Path.GetFullPath(targetPath);
        if (string.Equals(fullPath, DatabasePath, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("現在のファイルとは別の名前を選んでください。");
        var temporaryPath = fullPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var destination = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = temporaryPath, Pooling = false }.ToString()))
            { destination.Open(); _connection.BackupDatabase(destination); }
            File.Move(temporaryPath, fullPath, overwrite: true);
        }
        finally { if (File.Exists(temporaryPath)) File.Delete(temporaryPath); }
    }

    public void Dispose() => _connection.Dispose();
}
