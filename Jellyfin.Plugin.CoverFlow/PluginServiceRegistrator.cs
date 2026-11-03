using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.CoverFlow;

/********************************************************************
 *  BLOCK 03 - SERVICE REGISTRATION
 *
 *  Adds one lightweight hosted service. It registers the embedded
 *  frontend script after Jellyfin has loaded all plugin assemblies.
 ********************************************************************/
public sealed class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddHostedService<CoverFlowRegistrationService>();
    }
}
