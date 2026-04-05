using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class CarStatusPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F125PacketId.CarStatus;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new CarStatusPacket
        {
            CarStatusDataItems = new CarStatusData[F125Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < F125Constants.MaxCarsInUdpData; i++)
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
                ErsDeployedThisLap = reader.ReadFloat(),
                NetworkPaused = reader.ReadByte(),
            };
        }

        return packet;
    }
}
