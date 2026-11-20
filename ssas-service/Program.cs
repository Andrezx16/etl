using System.Security.Cryptography;
using System.Text;
using System.Data.Common;
using System.Xml.Linq;
using Microsoft.AnalysisServices.AdomdClient;
using Amo = Microsoft.AnalysisServices;

var connectionString = Environment.GetEnvironmentVariable("SSAS_CONNECTION") ?? "";
var databaseName = Environment.GetEnvironmentVariable("SSAS_DATABASE") ?? "Cubo_SNIES";
if (args is ["--check-instance"])
{
    try
    {
        using var server = ConnectToInstance(connectionString);
        Environment.ExitCode = server.ServerMode != Amo.ServerMode.Multidimensional ? 3
            : server.Databases.FindByName(databaseName) is null ? 10 : 0;
    }
    catch { Environment.ExitCode = 2; }
    return;
}

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(Environment.GetEnvironmentVariable("MERCURY_SSAS_URL") ?? "http://127.0.0.1:5000");
var app = builder.Build();
var secret = Environment.GetEnvironmentVariable("MERCURY_SERVICE_KEY") ?? "";
var processLock = new object();
var analyticsSlots = new SemaphoreSlim(3);
Guid? active = null;
var statuses = new Dictionary<Guid, string>();

app.Use(async (context, next) =>
{
    var supplied = context.Request.Headers["X-Mercury-Key"].ToString();
    if (secret.Length < 24 || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(supplied)))
    {
        context.Response.StatusCode = 401;
        return;
    }
    try { await next(context); }
    catch (Exception ex)
    {
        app.Logger.LogWarning("SSAS operation failed ({Type})", ex.GetType().Name);
        if (!context.Response.HasStarted)
        {
            context.Response.StatusCode = 503;
            await context.Response.WriteAsJsonAsync(new { code = "SSAS_ERROR", message = "Revisa la conexión, los permisos y el cubo." });
        }
    }
});

app.MapGet("/internal/health", () => Results.Ok(new { configured = connectionString.Length > 0 }));
app.MapGet("/internal/cube/status", () => Execute("SELECT {[Measures].[Numero de Programas]} ON 0 FROM [Cubo_SNIES]", 1));
app.MapGet("/internal/cube/metadata", () =>
{
    using var connection = new AdomdConnection(connectionString);
    connection.Open();
    var restriction = new AdomdRestrictionCollection();
    restriction.Add("CUBE_NAME", "Cubo_SNIES");
    return new { measures = Schema("MDSCHEMA_MEASURES", "MEASURE_UNIQUE_NAME"),
                 hierarchies = Schema("MDSCHEMA_HIERARCHIES", "HIERARCHY_UNIQUE_NAME") };
    string[] Schema(string name, string field) =>
        connection.GetSchemaDataSet(name, restriction).Tables[0].Rows.Cast<System.Data.DataRow>()
            .Select(row => Convert.ToString(row[field]) ?? "").ToArray();
});

app.MapPost("/internal/mdx/execute", (MdxRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req.Mdx) || req.Mdx.Length > 16000 || req.Limit is < 1 or > 10000)
        return Results.BadRequest(new { code = "MDX_LIMIT" });
    if (!analyticsSlots.Wait(0)) return Results.StatusCode(429);
    try { return Results.Ok(Execute(req.Mdx, req.Limit)); }
    finally { analyticsSlots.Release(); }
});

app.MapPost("/internal/cube/deploy", () =>
{
    lock (processLock)
    {
        if (active.HasValue) return Results.Conflict(new { code = "SSAS_BUSY" });
        using var server = ConnectToInstance(connectionString);
        if (server.Databases.FindByName(databaseName) is not null)
            return Results.Ok(new { state = "EXISTS" });

        var source = Environment.GetEnvironmentVariable("SSAS_SOURCE_CONNECTION");
        if (string.IsNullOrWhiteSpace(source)) return Results.BadRequest(new { code = "SSAS_SOURCE_REQUIRED" });
        XNamespace ns = "http://schemas.microsoft.com/analysisservices/2003/engine";
        var database = XElement.Load(Path.Combine(AppContext.BaseDirectory, "Cubo_SNIES.asdatabase"));
        database.SetElementValue(ns + "ID", databaseName);
        database.SetElementValue(ns + "Name", databaseName);
        var dataSource = database.Descendants(ns + "DataSource").Single();
        var sourceConnection = dataSource.Element(ns + "ConnectionString")
            ?? throw new InvalidOperationException("SSAS data source missing.");
        sourceConnection.Value = source;
        dataSource.SetElementValue(ns + "ConnectionStringSecurity", "Unchanged");
        dataSource.Element(ns + "ImpersonationInfo")?.ReplaceWith(new XElement(ns + "ImpersonationInfo",
            new XElement(ns + "ImpersonationMode", "ImpersonateServiceAccount")));
        var serverFields = new HashSet<string> { "State", "CreatedTimestamp", "LastProcessed", "LastSchemaUpdate", "LastUpdate" };
        database.Descendants().Where(node => serverFields.Contains(node.Name.LocalName)).Remove();
        var create = new XElement(ns + "Create", new XElement(ns + "ObjectDefinition", database));
        var results = server.Execute(create.ToString(SaveOptions.DisableFormatting));
        foreach (Amo.XmlaResult item in results)
            foreach (Amo.XmlaMessage message in item.Messages)
                if (message is Amo.XmlaError) throw new InvalidOperationException("SSAS rejected creation.");
        server.Refresh();
        if (server.Databases.FindByName(databaseName) is null)
            throw new InvalidOperationException("SSAS database was not created.");
        return Results.Ok(new { state = "CREATED" });
    }
});

app.MapPost("/internal/cube/process", (ProcessRequest req) =>
{
    lock (processLock)
    {
        if (active == req.Id || statuses.GetValueOrDefault(req.Id) == "OK")
            return Results.Accepted(value: new { state = statuses[req.Id] });
        if (active.HasValue) return Results.Conflict(new { code = "SSAS_BUSY" });
        active = req.Id;
        statuses[req.Id] = "EN_PROCESO";
        _ = Task.Run(() =>
        {
            var state = "ERROR";
            try
            {
                using var server = new Amo.Server();
                server.Connect(connectionString);
                var database = server.Databases.FindByName(databaseName)
                    ?? throw new InvalidOperationException("SSAS database missing.");
                // Shared dimensions must be processed alongside the cube.
                database.Process(Amo.ProcessType.ProcessFull);
                state = "OK";
            }
            catch (Exception ex)
            {
                app.Logger.LogWarning("SSAS Full Process failed ({Type})", ex.GetType().Name);
            }
            finally
            {
                lock (processLock) { statuses[req.Id] = state; active = null; }
            }
        });
        return Results.Accepted(value: new { state = "EN_PROCESO" });
    }
});

app.MapGet("/internal/cube/process/{id:guid}", (Guid id) =>
{
    lock (processLock) return Results.Ok(new { state = statuses.GetValueOrDefault(id, "DESCONOCIDO") });
});

app.Run();

static Amo.Server ConnectToInstance(string connectionString)
{
    var admin = new DbConnectionStringBuilder { ConnectionString = connectionString };
    admin.Remove("Initial Catalog");
    admin.Remove("Catalog");
    var server = new Amo.Server();
    try { server.Connect(admin.ConnectionString); return server; }
    catch { server.Dispose(); throw; }
}

object Execute(string mdx, int limit)
{
    using var connection = new AdomdConnection(connectionString);
    connection.Open();
    using var command = connection.CreateCommand();
    command.CommandText = mdx;
    command.CommandTimeout = 25;
    var result = command.ExecuteCellSet();
    if (result.Axes.Count is < 1 or > 2) throw new InvalidOperationException("Unsupported MDX shape.");
    var horizontal = result.Axes[0].Positions;
    var vertical = result.Axes.Count == 2 ? result.Axes[1].Positions : null;
    var columns = new List<Column>();
    if (vertical is { Count: > 0 })
    {
        var members = vertical[0].Members;
        for (var i = 0; i < members.Count; i++)
            columns.Add(new Column($"d{i}", members[i].LevelName.Split('.').Last().Trim('[', ']'), "string"));
    }
    for (var i = 0; i < horizontal.Count; i++)
        columns.Add(new Column($"m{i}", string.Join(" / ", horizontal[i].Members.Cast<Member>().Select(m => m.Caption)), "number"));
    var rows = new List<Dictionary<string, object?>>();
    var membersByRow = new List<string[]>();
    var total = vertical?.Count ?? 1;
    for (var row = 0; row < Math.Min(total, limit); row++)
    {
        var values = new Dictionary<string, object?>();
        var members = vertical?[row].Members;
        membersByRow.Add(members?.Cast<Member>().Select(m => m.UniqueName).ToArray() ?? []);
        for (var i = 0; i < (members?.Count ?? 0); i++) values[$"d{i}"] = members![i].Caption;
        for (var col = 0; col < horizontal.Count; col++)
        {
            var cell = vertical is null ? result.Cells[col] : result.Cells[col, row];
            values[$"m{col}"] = cell.Value is DBNull ? null : cell.Value;
        }
        rows.Add(values);
    }
    return new { columns, rows, membersByRow, totalRows = total, truncated = total > limit };
}

record MdxRequest(string Mdx, int Limit);
record ProcessRequest(Guid Id);
record Column(string Key, string Label, string Type);
