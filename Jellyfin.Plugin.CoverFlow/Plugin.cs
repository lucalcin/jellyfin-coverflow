using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.CoverFlow;

/********************************************************************
 *  BLOCK 01 - PLUGIN ENTRY POINT
 *
 *  Declares the Jellyfin plugin identity and keeps the minimal
 *  configuration required by BasePlugin. The visual component is
 *  registered separately by CoverFlowRegistrationService.
 ********************************************************************/
public sealed class Plugin : BasePlugin<PluginConfiguration>
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public override string Name => Constants.PluginName;

    public override Guid Id => Constants.PluginId;

    public static Plugin? Instance { get; private set; }
}

/// <summary>
/// Reserved configuration container for future user-selectable options.
/// </summary>
public sealed class PluginConfiguration : BasePluginConfiguration
{
}
