// swift-tools-version: 5.5
import PackageDescription

let package = Package(
    name: "swift-helpers",
    platforms: [
        .macOS(.v12) // ScreenCaptureKit requires macOS 12.3+
    ],
    products: [
        .executable(
            name: "swift-helpers",
            targets: ["ScreenFilterCLI"]
        ),
    ],
    targets: [
        .executableTarget(
            name: "ScreenFilterCLI",
            dependencies: [],
            path: ".",
            sources: ["ScreenFilterCLI.swift"]
        ),
    ]
)
