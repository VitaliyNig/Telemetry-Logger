using System.Collections.Frozen;

namespace F1Telemetry.F125.Protocol;

/// <summary>Formula byte → display name. Mirrors the m_formula field in PacketSessionData
/// (0=F1 Modern, 1=F1 Classic, 2=F2, 3=F1 Generic, 4=Beta, 6=Esports, 8=F1 World, 9=F1 Elimination).</summary>
public static class F125Formulas
{
    private static readonly FrozenDictionary<byte, string> Names =
        new Dictionary<byte, string>
        {
            [0] = "F1 Modern",
            [1] = "F1 Classic",
            [2] = "F2",
            [3] = "F1 Generic",
            [4] = "Beta",
            [6] = "Esports",
            [8] = "F1 World",
            [9] = "F1 Elimination",
        }.ToFrozenDictionary();

    public static string GetName(byte formula) =>
        Names.TryGetValue(formula, out var n) ? n : $"Formula {formula}";
}
