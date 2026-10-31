// Run: swift scripts/generate-command-icons.swift /absolute/path/to/repository
import AppKit

struct CommandIcon {
    let file: String
    let symbol: String
    let top: UInt32
    let bottom: UInt32
}

func color(_ hex: UInt32) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255,
            green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: 1)
}

let icons = [
    CommandIcon(file: "tools", symbol: "wrench.and.screwdriver", top: 0x52647E, bottom: 0x25364D),
    CommandIcon(file: "audio", symbol: "headphones", top: 0x8474EE, bottom: 0x5242B4),
    CommandIcon(file: "currency", symbol: "dollarsign.arrow.circlepath", top: 0x28B79B, bottom: 0x137667),
    CommandIcon(file: "exchange-rates", symbol: "chart.xyaxis.line", top: 0x56B669, bottom: 0x23783D),
    CommandIcon(file: "timezones", symbol: "globe", top: 0x4EA7E8, bottom: 0x2454AC),
    CommandIcon(file: "wifi", symbol: "wifi", top: 0x32BDDA, bottom: 0x146EAC),
    CommandIcon(file: "dictionaries", symbol: "text.book.closed", top: 0xEEA74D, bottom: 0xBD6425),
]

guard CommandLine.arguments.count == 2, CommandLine.arguments[1].hasPrefix("/") else {
    fatalError("Pass the absolute repository path.")
}
let assets = URL(fileURLWithPath: CommandLine.arguments[1]).appendingPathComponent("assets")

func drawSymbol(_ name: String, in rect: NSRect) {
    guard let symbol = NSImage(systemSymbolName: name, accessibilityDescription: nil)?
        .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 256, weight: .medium)) else {
        fatalError("Missing SF Symbol: \(name)")
    }
    let tinted = NSImage(size: symbol.size, flipped: false) { bounds in
        symbol.draw(in: bounds)
        NSColor.white.setFill()
        bounds.fill(using: .sourceIn)
        return true
    }
    let scale = min(rect.width / symbol.size.width, rect.height / symbol.size.height)
    let size = NSSize(width: symbol.size.width * scale, height: symbol.size.height * scale)
    tinted.draw(in: NSRect(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2,
                          width: size.width, height: size.height))
}

for icon in icons {
    guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 512, pixelsHigh: 512,
                                        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                        isPlanar: false, colorSpaceName: .deviceRGB,
                                        bytesPerRow: 0, bitsPerPixel: 0),
          let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        fatalError("Could not create an icon bitmap.")
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    let tile = NSBezierPath(roundedRect: NSRect(x: 24, y: 24, width: 464, height: 464),
                            xRadius: 104, yRadius: 104)
    NSGradient(starting: color(icon.top), ending: color(icon.bottom))!.draw(in: tile, angle: -90)
    NSColor.white.withAlphaComponent(0.16).setStroke()
    tile.lineWidth = 2
    tile.stroke()
    drawSymbol(icon.symbol, in: NSRect(x: 112, y: 112, width: 288, height: 288))
    if icon.file == "timezones" {
        color(0x2454AC).setFill()
        NSBezierPath(ovalIn: NSRect(x: 294, y: 76, width: 152, height: 152)).fill()
        drawSymbol("clock", in: NSRect(x: 308, y: 90, width: 124, height: 124))
    }
    NSGraphicsContext.restoreGraphicsState()
    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Could not encode \(icon.file).")
    }
    try png.write(to: assets.appendingPathComponent("\(icon.file)-icon.png"))
    print("Generated \(icon.file)-icon.png (512 × 512)")
}
