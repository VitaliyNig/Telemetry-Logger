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

            var sessionHeader = Header(sessionUid, 1f, (byte)F125PacketId.Session, playerCarIdx: carIdx, overallFrameIdentifier: 1);
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
            logger.ProcessPacket(Header(sessionUid, 2f, (byte)F125PacketId.LapData, carIdx, overallFrameIdentifier: 2), (byte)F125PacketId.LapData, lapDataPacket);

            var telemetryCars = new CarTelemetryData[22];
            var motionCars = new CarMotionData[22];
            for (var i = 0; i < 22; i++)
            {
                telemetryCars[i] = new CarTelemetryData();
                motionCars[i] = new CarMotionData();
            }

            telemetryCars[carIdx] = new CarTelemetryData { Speed = 310, Throttle = 1f, Gear = 8, EngineRpm = 11_800 };
            motionCars[carIdx] = new CarMotionData { WorldPositionX = 10, WorldPositionZ = 20 };

            logger.ProcessPacket(Header(sessionUid, 2.1f, (byte)F125PacketId.CarTelemetry, carIdx, overallFrameIdentifier: 3), (byte)F125PacketId.CarTelemetry,
                new CarTelemetryPacket { CarTelemetryData = telemetryCars });
            logger.ProcessPacket(Header(sessionUid, 2.2f, (byte)F125PacketId.Motion, carIdx, overallFrameIdentifier: 4), (byte)F125PacketId.Motion,
                new MotionPacket { CarMotionData = motionCars });

            var historyItems = Enumerable.Range(0, lapNum)
                .Select(_ => new LapHistoryData { LapValidBitFlags = 1 })
                .ToArray();
            logger.ProcessPacket(Header(sessionUid, 2.3f, (byte)F125PacketId.SessionHistory, carIdx, overallFrameIdentifier: 5), (byte)F125PacketId.SessionHistory,
                new SessionHistoryPacket
                {
                    CarIdx = carIdx,
                    NumLaps = lapNum,
                    LapHistoryDataItems = historyItems,
                });

            logger.ProcessPacket(Header(sessionUid, 3f, (byte)F125PacketId.Event, carIdx, overallFrameIdentifier: 6), (byte)F125PacketId.Event,
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


    [Fact]
    public void Flashback_DoesNotCompleteStaleLapOnRewind()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"sessionlogger-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempRoot);
        HistoryRoot.PersistentDefault = tempRoot;
        try
        {
            var logger = new SessionLogger(new LapSetupStore(), NullLogger<SessionLogger>.Instance);
            const ulong sessionUid = 88ul;
            const byte carIdx = 1;

            logger.ProcessPacket(Header(sessionUid, 1f, (byte)F125PacketId.Session, carIdx, 1), (byte)F125PacketId.Session, new SessionPacket
            {
                TrackId = 0, SessionType = 10, WeekendLinkIdentifier = 42, SessionLinkIdentifier = 24, TrackLength = 5400, TotalLaps = 10,
            });

            LapDataPacket LapPacket(byte currentLap, uint currentLapMs, uint lastLapMs) => new()
            {
                LapDataItems = Enumerable.Range(0, 22).Select(i => i == carIdx
                    ? new LapData { CurrentLapNum = currentLap, CurrentLapTimeInMs = currentLapMs, LastLapTimeInMs = lastLapMs, CarPosition = 2 }
                    : new LapData()).ToArray()
            };

            logger.ProcessPacket(Header(sessionUid, 10f, (byte)F125PacketId.LapData, carIdx, 2), (byte)F125PacketId.LapData, LapPacket(3, 5_000, 92_000));
            logger.ProcessPacket(Header(sessionUid, 11f, (byte)F125PacketId.Event, carIdx, 3), (byte)F125PacketId.Event, new EventPacket
            {
                EventCode = "FLBK",
                Details = new FlashbackEvent { FlashbackFrameIdentifier = 1, FlashbackSessionTime = 6f }
            });

            // After rewind, receiving an earlier lap number must not complete stale lap 3.
            logger.ProcessPacket(Header(sessionUid, 12f, (byte)F125PacketId.LapData, carIdx, 4), (byte)F125PacketId.LapData, LapPacket(2, 10_000, 0));
            logger.ProcessPacket(Header(sessionUid, 13f, (byte)F125PacketId.Event, carIdx, 5), (byte)F125PacketId.Event, new EventPacket { EventCode = "SEND" });

            var jsonPath = Directory.GetFiles(tempRoot, "*.json", SearchOption.AllDirectories).Single();
            using var doc = JsonDocument.Parse(File.ReadAllText(jsonPath));
            var laps = doc.RootElement.GetProperty("drivers").GetProperty(carIdx.ToString()).GetProperty("laps").EnumerateArray().ToList();
            Assert.DoesNotContain(laps, l => l.GetProperty("lapNum").GetByte() == 3);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    [Fact]
    public void Flashback_ReplacesExistingLapInsteadOfDuplicating()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"sessionlogger-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempRoot);
        HistoryRoot.PersistentDefault = tempRoot;
        try
        {
            var logger = new SessionLogger(new LapSetupStore(), NullLogger<SessionLogger>.Instance);
            const ulong sessionUid = 77ul;
            const byte carIdx = 1;

            logger.ProcessPacket(Header(sessionUid, 1f, (byte)F125PacketId.Session, carIdx, 1), (byte)F125PacketId.Session, new SessionPacket
            {
                TrackId = 0, SessionType = 10, WeekendLinkIdentifier = 42, SessionLinkIdentifier = 24, TrackLength = 5400, TotalLaps = 10,
            });

            LapDataPacket LapPacket(byte currentLap, uint currentLapMs, uint lastLapMs) => new()
            {
                LapDataItems = Enumerable.Range(0, 22).Select(i => i == carIdx
                    ? new LapData { CurrentLapNum = currentLap, CurrentLapTimeInMs = currentLapMs, LastLapTimeInMs = lastLapMs, CarPosition = 2 }
                    : new LapData()).ToArray()
            };

            logger.ProcessPacket(Header(sessionUid, 10f, (byte)F125PacketId.LapData, carIdx, 2), (byte)F125PacketId.LapData, LapPacket(2, 30_000, 0));
            logger.ProcessPacket(Header(sessionUid, 20f, (byte)F125PacketId.LapData, carIdx, 3), (byte)F125PacketId.LapData, LapPacket(3, 1_000, 91_000));
            logger.ProcessPacket(Header(sessionUid, 21f, (byte)F125PacketId.Event, carIdx, 4), (byte)F125PacketId.Event, new EventPacket
            {
                EventCode = "FLBK",
                Details = new FlashbackEvent { FlashbackFrameIdentifier = 2, FlashbackSessionTime = 12f }
            });
            logger.ProcessPacket(Header(sessionUid, 22f, (byte)F125PacketId.LapData, carIdx, 5), (byte)F125PacketId.LapData, LapPacket(2, 32_000, 0));
            logger.ProcessPacket(Header(sessionUid, 30f, (byte)F125PacketId.LapData, carIdx, 6), (byte)F125PacketId.LapData, LapPacket(3, 1_000, 88_000));
            logger.ProcessPacket(Header(sessionUid, 31f, (byte)F125PacketId.Event, carIdx, 7), (byte)F125PacketId.Event, new EventPacket { EventCode = "SEND" });

            var jsonPath = Directory.GetFiles(tempRoot, "*.json", SearchOption.AllDirectories).Single();
            using var doc = JsonDocument.Parse(File.ReadAllText(jsonPath));
            var laps = doc.RootElement.GetProperty("drivers").GetProperty(carIdx.ToString()).GetProperty("laps").EnumerateArray().ToList();
            Assert.Equal(1, laps.Count(l => l.GetProperty("lapNum").GetByte() == 2));
            Assert.Equal(88_000u, laps.Single(l => l.GetProperty("lapNum").GetByte() == 2).GetProperty("lapTimeMs").GetUInt32());
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    private static TelemetryPacketHeader Header(ulong sessionUid, float sessionTime, byte packetId, byte playerCarIdx, uint overallFrameIdentifier = 1) =>
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
            OverallFrameIdentifier: overallFrameIdentifier,
            PlayerCarIndex: playerCarIdx,
            SecondaryPlayerCarIndex: 255);
}
