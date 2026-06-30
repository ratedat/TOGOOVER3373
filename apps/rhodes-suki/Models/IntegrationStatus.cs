namespace RhodesSuki.Models;

public sealed record IntegrationStatus(
    string Name,
    string State,
    string Detail,
    bool IsReady);
