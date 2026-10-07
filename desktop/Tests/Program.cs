using System.Text.Json;
using Microsoft.Data.Sqlite;
using Yohaku.Desktop;

if (args.Length == 2 && args[0] == "--verify-web")
{
    using var imported = new LibraryDatabase(args[1], false);
    var library = imported.Load();
    if (library.Artworks.Count != 1 || library.Artworks[0].Notes != "Web版から追記したメモ" || library.Artworks[0].PositionX != 720 || library.Artworks[0].PositionY != -130.5 || library.Artworks[0].Revision != 3 || library.Comments.Count != 1)
        throw new Exception("Web-to-native roundtrip did not preserve the expected data.");
    Console.WriteLine("PASS: Web sql.js database reopens in C# with updated notes, revision, coordinates and comment intact.");
    return;
}

var root = args.Length > 0 ? Path.GetFullPath(args[0]) : Path.Combine(Path.GetTempPath(), "YohakuTests", Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
var path = Path.Combine(root, "roundtrip.db");
var backup = Path.Combine(root, "backup.db");
var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
JsonElement Json(object value) => JsonSerializer.SerializeToElement(value, options);
void Assert(bool condition, string message) { if (!condition) throw new Exception(message); }
void Reject(Action action, string message) { var threw = false; try { action(); } catch (InvalidOperationException) { threw = true; } Assert(threw, message); }
string id;
using (var database = new LibraryDatabase(path, true))
{
    var artwork = database.CreateArtwork(Json(new { title = "光の研究", url = "https://example.com/art/1", creator = "作家", kind = "illustration", tags = new[] { "逆光", "青" }, description = "静かな街", notes = "影の色を見る", collection = "光", favorite = true, status = "inbox", positionX = 240.5, positionY = -130.5 }));
    id = artwork.Id;
    Assert(artwork.Revision == 1 && artwork.Title == "光の研究", "Create failed");
    var updated = database.UpdateArtwork(Json(new { id, expectedRevision = 1, patch = new { notes = "影を比較する", positionX = 720 } }));
    Assert(updated.Revision == 2 && updated.PositionX == 720, "Update failed");
    Reject(() => database.UpdateArtwork(Json(new { id, expectedRevision = 1, patch = new { title = "lost update" } })), "Stale update was accepted");
    Reject(() => database.CreateArtwork(Json(new { title = "unsafe", url = "javascript:alert(1)" })), "Unsafe URL was accepted");
    Reject(() => database.CreateArtwork(Json(new { title = new string('a', 201), url = "https://example.com" })), "Oversize title was accepted");
    database.AddComment(Json(new { artworkId = id, body = "色の組み合わせが気になる" }));
    database.BackupTo(backup);
    Assert(database.Load().Comments.Count == 1, "Comment failed");
}
using (var reopened = new LibraryDatabase(path, false))
{
    var state = reopened.Load();
    Assert(state.Artworks.Count == 1 && state.Artworks[0].Notes == "影を比較する" && state.Comments.Count == 1, "Persistence failed");
    reopened.ImportLibrary(Json(state));
    Assert(reopened.Load().Artworks.Count == 2 && reopened.Load().Comments.Count == 2, "Import failed");
    Assert(reopened.Load().Artworks.Select(artwork => artwork.Id).Distinct().Count() == 2, "Import failed to regenerate ids");
    Reject(() => reopened.DeleteArtwork(Json(new { id, expectedRevision = 1 })), "Stale delete was accepted");
    reopened.DeleteArtwork(Json(new { id, expectedRevision = 2 }));
    Assert(reopened.Load().Artworks.Count == 1 && reopened.Load().Comments.Count == 1, "Cascade delete failed");
    using var copy = new LibraryDatabase(backup, false);
    Assert(copy.Load().Artworks.Count == 1 && copy.Load().Comments.Count == 1, "Backup failed");
}
var foreignPath = Path.Combine(root, "foreign.db");
using (var foreign = new SqliteConnection($"Data Source={foreignPath};Pooling=False")) { foreign.Open(); using var command = foreign.CreateCommand(); command.CommandText = "CREATE TABLE unrelated(id INTEGER)"; command.ExecuteNonQuery(); }
Reject(() => { using var foreign = new LibraryDatabase(foreignPath, false); }, "Foreign database was accepted");
Console.WriteLine("PASS: CRUD, committed persistence, revision conflict, validation, atomic import, cascade delete, portable backup and foreign database rejection.");
Console.WriteLine($"Test files: {root}");
