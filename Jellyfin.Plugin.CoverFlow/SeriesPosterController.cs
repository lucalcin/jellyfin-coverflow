using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.CoverFlow;

/********************************************************************
 *  BLOCK 05 - SERIES POSTER ENDPOINT
 *
 *  Resolves an optional poster stored beside a book file. The item
 *  identifier is resolved by Jellyfin, so callers cannot provide an
 *  arbitrary filesystem path. PNG takes precedence over JPEG.
 ********************************************************************/
[ApiController]
[Authorize]
[Route("CoverFlow")]
public sealed class SeriesPosterController : ControllerBase
{
    private static readonly (string FileName, string ContentType)[] PosterCandidates =
    [
        ("coverflow-series.png", "image/png"),
        ("coverflow-series.jpg", "image/jpeg")
    ];

    private readonly ILibraryManager _libraryManager;

    public SeriesPosterController(ILibraryManager libraryManager)
    {
        _libraryManager = libraryManager;
    }

    [HttpGet("SeriesPoster/{itemId:guid}")]
    [Produces("image/png", "image/jpeg")]
    public IActionResult GetSeriesPoster(Guid itemId)
    {
        var item = _libraryManager.GetItemById(itemId);
        var itemPath = item?.Path;
        if (string.IsNullOrWhiteSpace(itemPath))
        {
            return NotFound();
        }

        var directory = Directory.Exists(itemPath)
            ? itemPath
            : Path.GetDirectoryName(itemPath);
        if (string.IsNullOrWhiteSpace(directory))
        {
            return NotFound();
        }

        foreach (var candidate in PosterCandidates)
        {
            var posterPath = Path.Combine(directory, candidate.FileName);
            if (System.IO.File.Exists(posterPath))
            {
                return PhysicalFile(posterPath, candidate.ContentType);
            }
        }

        return NotFound();
    }
}
