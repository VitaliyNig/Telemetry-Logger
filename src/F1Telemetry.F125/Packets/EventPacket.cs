using System.Text.Json.Serialization;

namespace F1Telemetry.F125.Packets;

public sealed class EventPacket
{
    public string EventCode { get; set; } = string.Empty;
    public EventDataDetails? Details { get; set; }
}

// SignalR / System.Text.Json serializes Details using the declared base type unless polymorphism is declared;
// without this, PENA payloads arrive as details: {} and the UI cannot map penaltyType / infringementType.
[JsonPolymorphic(TypeDiscriminatorPropertyName = "$type")]
[JsonDerivedType(typeof(FastestLapEvent), "fastestLap")]
[JsonDerivedType(typeof(RetirementEvent), "retirement")]
[JsonDerivedType(typeof(DrsDisabledEvent), "drsDisabled")]
[JsonDerivedType(typeof(TeamMateInPitsEvent), "teamMateInPits")]
[JsonDerivedType(typeof(RaceWinnerEvent), "raceWinner")]
[JsonDerivedType(typeof(PenaltyEvent), "penalty")]
[JsonDerivedType(typeof(SpeedTrapEvent), "speedTrap")]
[JsonDerivedType(typeof(StartLightsEvent), "startLights")]
[JsonDerivedType(typeof(DriveThroughPenaltyServedEvent), "driveThroughServed")]
[JsonDerivedType(typeof(StopGoPenaltyServedEvent), "stopGoServed")]
[JsonDerivedType(typeof(FlashbackEvent), "flashback")]
[JsonDerivedType(typeof(ButtonsEvent), "buttons")]
[JsonDerivedType(typeof(OvertakeEvent), "overtake")]
[JsonDerivedType(typeof(SafetyCarEvent), "safetyCar")]
[JsonDerivedType(typeof(CollisionEvent), "collision")]
public class EventDataDetails { }

public sealed class FastestLapEvent : EventDataDetails
{
    public byte VehicleIdx { get; set; }
    public float LapTime { get; set; }
}

public sealed class RetirementEvent : EventDataDetails
{
    public byte VehicleIdx { get; set; }
    public byte Reason { get; set; }
}

public sealed class DrsDisabledEvent : EventDataDetails
{
    public byte Reason { get; set; }
}

public sealed class TeamMateInPitsEvent : EventDataDetails
{
    public byte VehicleIdx { get; set; }
}

public sealed class RaceWinnerEvent : EventDataDetails
{
    public byte VehicleIdx { get; set; }
}

public sealed class PenaltyEvent : EventDataDetails
{
    public byte PenaltyType { get; set; }
    public byte InfringementType { get; set; }
    public byte VehicleIdx { get; set; }
    public byte OtherVehicleIdx { get; set; }
    public byte Time { get; set; }
    public byte LapNum { get; set; }
    public byte PlacesGained { get; set; }
}

public sealed class SpeedTrapEvent : EventDataDetails
{
    public byte VehicleIdx { get; set; }
    public float Speed { get; set; }
    public byte IsOverallFastestInSession { get; set; }
    public byte IsDriverFastestInSession { get; set; }
    public byte FastestVehicleIdxInSession { get; set; }
    public float FastestSpeedInSession { get; set; }
}

public sealed class StartLightsEvent : EventDataDetails
{
    public byte NumLights { get; set; }
}

public sealed class DriveThroughPenaltyServedEvent : EventDataDetails
{
    public byte VehicleIdx { get; set; }
}

public sealed class StopGoPenaltyServedEvent : EventDataDetails
{
    public byte VehicleIdx { get; set; }
    public float StopTime { get; set; }
}

public sealed class FlashbackEvent : EventDataDetails
{
    public uint FlashbackFrameIdentifier { get; set; }
    public float FlashbackSessionTime { get; set; }
}

public sealed class ButtonsEvent : EventDataDetails
{
    public uint ButtonStatus { get; set; }
}

public sealed class OvertakeEvent : EventDataDetails
{
    public byte OvertakingVehicleIdx { get; set; }
    public byte BeingOvertakenVehicleIdx { get; set; }
}

public sealed class SafetyCarEvent : EventDataDetails
{
    public byte SafetyCarType { get; set; }
    public byte EventType { get; set; }
}

public sealed class CollisionEvent : EventDataDetails
{
    public byte Vehicle1Idx { get; set; }
    public byte Vehicle2Idx { get; set; }
}
