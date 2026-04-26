using System.Text.Json;
using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Host.Logging;
using F1Telemetry.State;
using F1Telemetry.Telemetry;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace F1Telemetry.Host.Tests;

public sealed class SessionLoggerTests
{
    [Fact]
    public void Send_FinalizesPendingLap_WhenLapNumberDidNotAdvance()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"sessionlogger-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempRoot);
        HistoryRoot.PersistentDefault = tempRoot;

        try
        {
            var logger = new SessionLogger(new LapSetupStore(), NullLogger<SessionLogger>.Instance);
            const ulong sessionUid = 999ul;
            const byte carIdx = 1;
            const byte lapNum = 5;

            var sessionHeader = Header(sessionUid, 1f, (byte)F125PacketId.Session, playerCarIdx: carIdx);
            logger.ProcessPacket(sessionHeader, (byte)F125PacketId.Session, new SessionPacket
            {
                TrackId = 0,
                SessionType = 10,
                WeekendLinkIdentifier = 42,
                SessionLinkIdentifier = 24,
                TrackLength = 5400,
                TotalLaps = 10,
            });

            var lapDataItems = new LapData[22];
            for (var i = 0; i < lapDataItems.Length; i++)
                lapDataItems[i] = new LapData();

            lapDataItems[carIdx] = new LapData
            {
                CurrentLapNum = lapNum,
                CurrentLapTimeInMs = 40_000,
                LastLapTimeInMs = 95_432,
                Sector = 2,
                LapDistance = 1200,
                CarPosition = 3,
            };

            var lapDataPacket = new LapDataPacket { LapDataItems = lapDataItems };
            logger.ProcessPacket(Header(sessionUid, 2f, (byte)F125PacketId.LapData, carIdx), (byte)F125PacketId.LapData, lapDataPacket);

            var telemetryCars = new CarTelemetryData[22];
            var motionCars = new CarMotionData[22];
            for (var i = 0; i < 22; i++)
            {
                telemetryCars[i] = new CarTelemetryData();
                motionCars[i] = new CarMotionData();
            }

            telemetryCars[carIdx] = new CarTelemetryData { Speed = 310, Throttle = 1f, Gear = 8, EngineRpm = 11_800 };
            motionCars[carIdx] = new CarMotionData { WorldPositionX = 10, WorldPositionZ = 20 };

            logger.ProcessPacket(Header(sessionUid, 2.1f, (byte)F125PacketId.CarTelemetry, carIdx), (byte)F125PacketId.CarTelemetry,
                new CarTelemetryPacket { CarTelemetryData = telemetryCars });
            logger.ProcessPacket(Header(sessionUid, 2.2f, (byte)F125PacketId.Motion, carIdx), (byte)F125PacketId.Motion,
                new MotionPacket { CarMotionData = motionCars });

            var historyItems = Enumerable.Range(0, lapNum)
                .Select(_ => new LapHistoryData { LapValidBitFlags = 1 })
                .ToArray();
            logger.ProcessPacket(Header(sessionUid, 2.3f, (byte)F125PacketId.SessionHistory, carIdx), (byte)F125PacketId.SessionHistory,
                new SessionHistoryPacket
                {
                    CarIdx = carIdx,
                    NumLaps = lapNum,
                    LapHistoryDataItems = historyItems,
                });

            logger.ProcessPacket(Header(sessionUid, 3f, (byte)F125PacketId.Event, carIdx), (byte)F125PacketId.Event,
                new EventPacket { EventCode = "SEND" });

            var jsonPath = Directory.GetFiles(tempRoot, "*.json", SearchOption.AllDirectories).Single();
            using var doc = JsonDocument.Parse(File.ReadAllText(jsonPath));

            var laps = doc.RootElement
                .GetProperty("drivers")
                .GetProperty(carIdx.ToString())
                .GetProperty("laps");

            Assert.Contains(laps.EnumerateArray(), l => l.GetProperty("lapNum").GetByte() == lapNum);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    private static TelemetryPacketHeader Header(ulong sessionUid, float sessionTime, byte packetId, byte playerCarIdx) =>
        new(
            PacketFormat: 2025,
            GameYear: 25,
            GameMajorVersion: 1,
            GameMinorVersion: 0,
            PacketVersion: 1,
            PacketId: packetId,
            SessionUid: sessionUid,
            SessionTime: sessionTime,
            FrameIdentifier: 1,
            OverallFrameIdentifier: 1,
            PlayerCarIndex: playerCarIdx,
            SecondaryPlayerCarIndex: 255);
}
