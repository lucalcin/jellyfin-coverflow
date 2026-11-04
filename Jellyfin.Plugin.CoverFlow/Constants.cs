namespace Jellyfin.Plugin.CoverFlow;

/********************************************************************
 *  BLOCK 02 - PLUGIN CONSTANTS
 *
 *  Centralizes stable identifiers shared by the plugin manifest and
 *  the JavaScript Injector registration payload.
 ********************************************************************/
internal static class Constants
{
    public const string PluginName = "CoverFlow";
    public const string PluginVersion = "0.4.8.0";
    public const string ScriptId = "effecta-book-coverflow-main";
    public const string ScriptResourceName = "Jellyfin.Plugin.CoverFlow.Web.coverflow.js";

    public static readonly Guid PluginId = Guid.Parse("2f53b2eb-8f39-4472-a55f-cb715c942594");
}
