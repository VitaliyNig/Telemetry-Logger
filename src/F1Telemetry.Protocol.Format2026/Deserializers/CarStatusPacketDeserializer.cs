using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026.Deserializers;

/// <summary>
/// Car status packet for format 2026. New field <c>m_ersHarvestLimitPerLap</c> (float) is
/// inserted between <c>m_ersHarvestedThisLapMGUH</c> and <c>m_ersDeployedThisLap</c>.
/// </summary>
internal sealed class CarStatusPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F1PacketId.CarStatus;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader126(data, PacketHeaderReader.HeaderSize);
        var packet = new CarStatusPacket
        {
            CarStatusDataItems = new CarStatusData[Format2026Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < Format2026Constants.MaxCarsInUdpData; i++)
        {
            packet.CarStatusDataItems[i] = new CarStatusData
            {
                TractionControl = reader.ReadByte(),
                AntiLockBrakes = reader.ReadByte(),
                FuelMix = reader.ReadByte(),
                FrontBrakeBias = reader.ReadByte(),
                PitLimiterStatus = reader.ReadByte(),
                FuelInTank = reader.ReadFloat(),
                FuelCapacity = reader.ReadFloat(),
                FuelRemainingLaps = reader.ReadFloat(),
                MaxRpm = reader.ReadUInt16(),
                IdleRpm = reader.ReadUInt16(),
                MaxGears = reader.ReadByte(),
                DrsAllowed = reader.ReadByte(),
                DrsActivationDistance = reader.ReadUInt16(),
                ActualTyreCompound = reader.ReadByte(),
                VisualTyreCompound = reader.ReadByte(),
                TyresAgeLaps = reader.ReadByte(),
                VehicleFiaFlags = reader.ReadSByte(),
                EnginePowerIce = reader.ReadFloat(),
                EnginePowerMguK = reader.ReadFloat(),
                ErsStoreEnergy = reader.ReadFloat(),
                ErsDeployMode = reader.ReadByte(),
                ErsHarvestedThisLapMguK = reader.ReadFloat(),
                ErsHarvestedThisLapMguH = reader.ReadFloat(),
                // New in 2026: lap-level harvest cap (Joules) sits between MGU-H and DeployedThisLap.
                ErsHarvestLimitPerLap = reader.ReadFloat(),
                ErsDeployedThisLap = reader.ReadFloat(),
                NetworkPaused = reader.ReadByte(),
            };
        }

        return packet;
    }
}
