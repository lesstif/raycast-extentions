// wifi-helper: small CoreWLAN command-line helper for the wifi module.
//
// Build (setup.sh does this):
//   swiftc -O -framework CoreWLAN -framework CoreLocation native/wifi-helper.swift -o assets/wifi-helper
//
// Commands (output is one JSON object on stdout):
//   wifi-helper info                 Interface name, power state, current connection
//   wifi-helper scan [SSID]          Scan. With SSID: only that network (all of its APs).
//   wifi-helper join SSID [CH ...]   Join a known network (password from the keychain) and
//                                    wait until the interface is on it. CH: channels of its APs,
//                                    used to verify the join when the SSID is hidden.
//
// Since macOS 14, SSID and BSSID are nil for a process without Location Services
// permission. A scan for a given SSID still filters by that name and still reports
// RSSI and channel. The extension uses this: it scans each known SSID by name.
// The helper asks for Location permission once. Raycast (the parent app) owns that
// permission; when it is granted, one scan shows every SSID.
//
// On macOS 15+ a join of a saved network reports error -3900 "tmpErr" even when the
// join succeeds (the API cannot confirm the hidden SSID). The join command ignores
// that error and checks the interface instead.

import CoreLocation
import CoreWLAN
import Foundation

struct BSSInfo: Codable {
    let ssid: String?
    let bssid: String?
    let rssi: Int
    let noise: Int
    let channel: Int?
    let band: String?
}

struct CurrentInfo: Codable {
    let ssid: String?
    let bssid: String?
    let rssi: Int
    let noise: Int
    let channel: Int?
    let band: String?
    let txRate: Double
}

struct InfoResult: Codable {
    let interface: String
    let powerOn: Bool
    let locationAuthorized: Bool
    let current: CurrentInfo?
}

struct ScanResult: Codable {
    let query: String?
    let locationAuthorized: Bool
    let networks: [BSSInfo]
    let error: String?
}

struct JoinResult: Codable {
    let ssid: String
    let joined: Bool
    let verifiedBy: String? // "ssid" | "channel" | nil
    let error: String?
    let current: CurrentInfo?
}

// CWChannelBand raw values: 0 unknown, 1 2.4 GHz, 2 5 GHz, 3 6 GHz (macOS 13+).
// Compare raw values so the code builds with any SDK.
func bandName(_ channel: CWChannel?) -> String? {
    guard let channel = channel else { return nil }
    switch channel.channelBand.rawValue {
    case 1: return "2.4"
    case 2: return "5"
    case 3: return "6"
    default: return nil
    }
}

func printJSON<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    guard let data = try? encoder.encode(value) else { fail("Cannot encode JSON") }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

// ---- Location Services -----------------------------------------------------

/// Ask for Location permission when the user has not decided yet, and wait a little
/// for the answer. Returns true when the process may read SSIDs.
final class LocationGate: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var changed = false

    func authorize(timeout: TimeInterval) -> Bool {
        guard CLLocationManager.locationServicesEnabled() else { return false }
        manager.delegate = self
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
            let deadline = Date().addingTimeInterval(timeout)
            while !changed && Date() < deadline {
                RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
            }
        }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: return true
        default: return false
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus != .notDetermined { changed = true }
    }
}

let locationGate = LocationGate()
let locationAuthorized = locationGate.authorize(timeout: 8)

// ---- Interface --------------------------------------------------------------

guard let iface = CWWiFiClient.shared().interface() else {
    fail("No Wi-Fi interface")
}

func currentInfo() -> CurrentInfo? {
    let channel = iface.wlanChannel()
    let rssi = iface.rssiValue()
    // RSSI is 0 and the channel is nil when the interface is not associated.
    guard iface.powerOn(), channel != nil, rssi != 0 else { return nil }
    return CurrentInfo(
        ssid: iface.ssid(),
        bssid: iface.bssid(),
        rssi: rssi,
        noise: iface.noiseMeasurement(),
        channel: channel?.channelNumber,
        band: bandName(channel),
        txRate: iface.transmitRate()
    )
}

/// Scan once, with one retry when the driver is busy. Returns the networks or throws.
func scan(name: String?) throws -> [CWNetwork] {
    var lastError: Error?
    for attempt in 0..<2 {
        do {
            return Array(try iface.scanForNetworks(withName: name))
        } catch {
            lastError = error
            if attempt == 0 { Thread.sleep(forTimeInterval: 1.0) }
        }
    }
    throw lastError!
}

func bssInfo(_ net: CWNetwork) -> BSSInfo {
    BSSInfo(
        ssid: net.ssid,
        bssid: net.bssid,
        rssi: net.rssiValue,
        noise: net.noiseMeasurement,
        channel: net.wlanChannel?.channelNumber,
        band: bandName(net.wlanChannel)
    )
}

let args = Array(CommandLine.arguments.dropFirst())
let command = args.first ?? "info"

switch command {
case "info":
    printJSON(InfoResult(
        interface: iface.interfaceName ?? "en0",
        powerOn: iface.powerOn(),
        locationAuthorized: locationAuthorized,
        current: currentInfo()
    ))

case "scan":
    let name: String? = args.count > 1 ? args[1] : nil
    do {
        let list = try scan(name: name).map(bssInfo).sorted { $0.rssi > $1.rssi }
        printJSON(ScanResult(query: name, locationAuthorized: locationAuthorized, networks: list, error: nil))
    } catch {
        printJSON(ScanResult(query: name, locationAuthorized: locationAuthorized, networks: [],
                             error: error.localizedDescription))
    }

case "join":
    guard args.count > 1 else { fail("Usage: wifi-helper join SSID [CHANNEL ...]") }
    let ssid = args[1]
    var channels = Set(args.dropFirst(2).compactMap { Int($0) })

    /// "ssid" or "channel" when the interface is on the target network now, else nil.
    func onTarget() -> String? {
        guard let cur = currentInfo() else { return nil }
        if let name = cur.ssid { return name == ssid ? "ssid" : nil }
        if let ch = cur.channel, channels.contains(ch) { return "channel" }
        return nil
    }

    // Already on it? Joining the current network again drops the link and macOS may
    // then auto-join a different network, so do nothing. (Checked again after the scan,
    // which adds the channels of every AP of this SSID.)
    if let by = onTarget() {
        printJSON(JoinResult(ssid: ssid, joined: true, verifiedBy: by, error: nil, current: currentInfo()))
        exit(0)
    }

    // Find the network. The scan is by name, so it works without Location permission.
    let found: [CWNetwork]
    do {
        found = try scan(name: ssid).sorted { $0.rssiValue > $1.rssiValue }
    } catch {
        printJSON(JoinResult(ssid: ssid, joined: false, verifiedBy: nil,
                             error: "Scan failed: \(error.localizedDescription)", current: currentInfo()))
        exit(0)
    }
    guard let target = found.first else {
        printJSON(JoinResult(ssid: ssid, joined: false, verifiedBy: nil,
                             error: "\(ssid) is not in range", current: currentInfo()))
        exit(0)
    }
    for net in found { if let ch = net.wlanChannel?.channelNumber { channels.insert(ch) } }

    if let by = onTarget() {
        printJSON(JoinResult(ssid: ssid, joined: true, verifiedBy: by, error: nil, current: currentInfo()))
        exit(0)
    }

    // Join. The password comes from the keychain for a saved network.
    // Error -3900 (tmpErr) is reported even for a join that works, so only remember it.
    var joinError: String?
    do {
        try iface.associate(to: target, password: nil)
    } catch {
        joinError = error.localizedDescription
    }

    // Wait until the interface is on the network: by SSID when visible, otherwise by channel.
    let deadline = Date().addingTimeInterval(15)
    var verifiedBy: String?
    while Date() < deadline {
        if let by = onTarget() { verifiedBy = by; break }
        Thread.sleep(forTimeInterval: 0.5)
    }
    let cur = currentInfo()
    if verifiedBy != nil {
        printJSON(JoinResult(ssid: ssid, joined: true, verifiedBy: verifiedBy, error: nil, current: cur))
    } else {
        let why = joinError ?? "The interface did not move to \(ssid) in time"
        printJSON(JoinResult(ssid: ssid, joined: false, verifiedBy: nil, error: why, current: cur))
    }

default:
    fail("Usage: wifi-helper info | scan [SSID] | join SSID [CHANNEL ...]")
}
