using System.Reflection;
using System.Runtime.Loader;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.CoverFlow;

/********************************************************************
 *  BLOCK 04 - JAVASCRIPT INJECTOR BRIDGE
 *
 *  Registers the embedded CoverFlow script through JavaScript
 *  Injector's public reflection interface. No direct dependency on
 *  that plugin assembly is required, so Jellyfin can still start when
 *  JavaScript Injector is missing or temporarily disabled.
 ********************************************************************/
public sealed class CoverFlowRegistrationService : IHostedService
{
    private const string InjectorAssemblyName = "Jellyfin.Plugin.JavaScriptInjector";
    private const string InjectorInterfaceName = "Jellyfin.Plugin.JavaScriptInjector.PluginInterface";

    private readonly ILogger<CoverFlowRegistrationService> _logger;

    public CoverFlowRegistrationService(ILogger<CoverFlowRegistrationService> logger)
    {
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            var script = ReadEmbeddedScript();
            var interfaceType = FindInjectorInterface();

            if (interfaceType is null)
            {
                _logger.LogWarning("JavaScript Injector is not loaded; CoverFlow cannot register its web component.");
                return Task.CompletedTask;
            }

            var payload = new JObject
            {
                ["id"] = Constants.ScriptId,
                ["name"] = Constants.PluginName,
                ["script"] = script,
                ["enabled"] = true,
                ["requiresAuthentication"] = false,
                ["pluginId"] = Constants.PluginId.ToString(),
                ["pluginName"] = Constants.PluginName,
                ["pluginVersion"] = Constants.PluginVersion
            };

            var result = interfaceType.GetMethod("RegisterScript", BindingFlags.Public | BindingFlags.Static)
                ?.Invoke(null, [payload]);

            if (result is true)
            {
                _logger.LogInformation("CoverFlow frontend registered with JavaScript Injector.");
            }
            else
            {
                _logger.LogError("JavaScript Injector rejected the CoverFlow registration.");
            }
        }
        catch (Exception ex)
        {
            // A frontend extension must never prevent the media server from starting.
            _logger.LogError(ex, "Failed to register the CoverFlow frontend.");
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }

    private static Type? FindInjectorInterface()
    {
        var assembly = AssemblyLoadContext.All
            .SelectMany(context => context.Assemblies)
            .FirstOrDefault(candidate => candidate.GetName().Name == InjectorAssemblyName);

        return assembly?.GetType(InjectorInterfaceName);
    }

    private static string ReadEmbeddedScript()
    {
        var assembly = typeof(CoverFlowRegistrationService).Assembly;
        using var stream = assembly.GetManifestResourceStream(Constants.ScriptResourceName)
            ?? throw new InvalidOperationException($"Embedded resource {Constants.ScriptResourceName} was not found.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
