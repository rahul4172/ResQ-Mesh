import pytest
from backend.app.parser import RxSerialParser
from backend.app.schemas import EventType, AudioStreamState


def test_parse_gps_line():
    parser = RxSerialParser()
    line = "[GPS] 22.572645, 88.363892 | alt 18 m | 4.5 km/h | course 124.5 | sats 9 | hdop 1.2 | UTC 14:22:05 | RSSI -68 dBm"
    results = parser.parse_line(line)
    
    # Expect a GPS event and a RAW_LOG event
    types = [t for t, _ in results]
    assert EventType.GPS in types
    assert EventType.RAW_LOG in types

    gps_event = next(m for t, m in results if t == EventType.GPS)
    assert gps_event.latitude == 22.572645
    assert gps_event.longitude == 88.363892
    assert gps_event.altitude_m == 18
    assert gps_event.speed_kmh == 4.5
    assert gps_event.course_deg == 124.5
    assert gps_event.satellites == 9
    assert gps_event.hdop == 1.2
    assert gps_event.utc_time == "14:22:05"
    assert gps_event.rssi_dbm == -68


def test_parse_audio_lifecycle():
    parser = RxSerialParser()
    
    # Stream started
    results = parser.parse_line("[PLAYBACK] Stream started")
    audio_event = next(m for t, m in results if t == EventType.AUDIO_LIFECYCLE)
    assert audio_event.state == AudioStreamState.STREAMING

    # Stream ended
    results = parser.parse_line("[PLAYBACK] Stream ended, waiting for audio")
    audio_event = next(m for t, m in results if t == EventType.AUDIO_LIFECYCLE)
    assert audio_event.state == AudioStreamState.IDLE


def test_parse_status_report_block():
    parser = RxSerialParser()
    status_lines = [
        "========== RX STATUS ==========",
        "Voice packets: 1420 | lost: 8 (0.6%)",
        "GPS packets received: 24",
        "Radio: DIO0 interrupts 1448 | CRC/empty 0 | found by poll only 0",
        "Decoded frames: 5680 | muted (silent): 380",
        "Invalid packets: 0 | queue-full drops: 0 | skipped (latency cap): 0 | audio errors: 0",
        "Last voice packet: 120 ms ago, RSSI -68 dBm, SNR 8.5 dB",
        "Decoded peak level: 12400 | slowest decode: 3.8 ms (frame period 40 ms)",
        "Queue waiting: 3",
        "Stack min free bytes: lora=6144 playback=24180 loop=28400",
        "Heap: 184512",
        "===============================",
    ]

    events_produced = []
    for line in status_lines:
        res = parser.parse_line(line)
        events_produced.extend(res)

    status_events = [m for t, m in events_produced if t == EventType.STATUS_REPORT]
    assert len(status_events) == 1
    stats = status_events[0]
    assert stats.voice_packets_received == 1420
    assert stats.voice_packets_lost == 8
    assert stats.packet_loss_pct == 0.6
    assert stats.gps_packets_received == 24
    assert stats.dio0_interrupts == 1448
    assert stats.decoded_frames == 5680
    assert stats.muted_frames == 380
    assert stats.last_voice_ms_ago == 120
    assert stats.last_rssi_dbm == -68
    assert stats.last_snr_db == 8.5
    assert stats.decoded_peak_level == 12400
    assert stats.slowest_decode_ms == 3.8
    assert stats.queue_waiting == 3
    assert stats.heap_free == 184512


def test_parse_unknown_record():
    parser = RxSerialParser()
    line = "Some completely unrecognized debug line xyz 123"
    results = parser.parse_line(line)
    
    assert len(results) == 1
    event_type, raw_event = results[0]
    assert event_type == EventType.RAW_LOG
    assert raw_event.is_unknown is True
    assert raw_event.line == line
