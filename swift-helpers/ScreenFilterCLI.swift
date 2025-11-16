import Foundation
import ScreenCaptureKit
import CoreMedia
import CoreGraphics
import Dispatch
import CoreFoundation

// MARK: - Logger

enum LogLevel: String {
    case info = "INFO"
    case error = "ERROR"
    case debug = "DEBUG"
}

struct Logger {
    static func log(_ level: LogLevel, _ message: String) {
        print("\(level.rawValue): \(message)")
        if level == .error {
            fflush(stderr)
        } else {
            fflush(stdout)
        }
    }
    
    static func info(_ message: String) { log(.info, message) }
    static func error(_ message: String) { log(.error, message) }
    static func debug(_ message: String) { log(.debug, message) }
}

// MARK: - Command Line Parser

struct CommandLineConfig {
    let processID: pid_t
    let windowTitle: String?
    
    init(arguments: [String]) throws {
        guard arguments.count >= 2 else {
            throw CLIError.invalidUsage("Usage: ScreenFilterCLI <process-id> [window-title]")
        }
        
        guard let pid = pid_t(arguments[1]) else {
            throw CLIError.invalidProcessID
        }
        
        self.processID = pid
        self.windowTitle = arguments.count > 2 ? arguments[2] : nil
    }
}

// MARK: - Error Types

enum CLIError: LocalizedError {
    case invalidUsage(String)
    case invalidProcessID
    case permissionDenied
    case windowNotFound(pid_t)
    case captureSetupFailed(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidUsage(let usage):
            return usage
        case .invalidProcessID:
            return "Invalid process ID"
        case .permissionDenied:
            return "Screen recording permission denied"
        case .windowNotFound(let pid):
            return "No window found for process ID \(pid)"
        case .captureSetupFailed(let reason):
            return "Failed to setup capture: \(reason)"
        }
    }
}

// MARK: - Permission Manager

@available(macOS 12.3, *)
struct PermissionManager {
    static func checkAndRequestPermission() throws {
        Logger.info("Checking screen recording permission...")
        
        if CGPreflightScreenCaptureAccess() {
            Logger.info("Permission already granted")
            return
        }
        
        Logger.info("Requesting screen-recording permission...")
        CGRequestScreenCaptureAccess()
        
        let granted = CGPreflightScreenCaptureAccess()
        if granted {
            Logger.info("Permission granted after request")
        } else {
            Logger.error("Screen recording permission denied")
            throw CLIError.permissionDenied
        }
    }
}

// MARK: - Window Finder

@available(macOS 12.3, *)
struct WindowFinder {
    static func findWindow(pid: pid_t, title: String?) async throws -> SCWindow {
        Logger.info("Finding window for process ID: \(pid), title: \(title ?? "any")")
        
        // Get all available windows
        Logger.info("Getting shareable content...")
        let available = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        
        Logger.info("Found \(available.windows.count) total windows")
        logAllWindows(available.windows)
        
        // Try to find window with title first, then fallback to PID only
        if let window = findWindowWithTitle(windows: available.windows, pid: pid, title: title) {
            return window
        }
        
        if let window = findWindowWithPID(windows: available.windows, pid: pid) {
            return window
        }
        
        Logger.error("No window found for process ID \(pid)")
        throw CLIError.windowNotFound(pid)
    }
    
    private static func logAllWindows(_ windows: [SCWindow]) {
        for (index, win) in windows.enumerated() {
            let winTitle = win.title ?? "Untitled"
            let appPid = win.owningApplication?.processID ?? 0
            let appName = win.owningApplication?.applicationName ?? "Unknown"
            Logger.debug("Window[\(index)]: ID=\(win.windowID) (0x\(String(win.windowID, radix: 16))) PID=\(appPid) Title=\"\(winTitle)\" App=\(appName)")
        }
    }
    
    private static func findWindowWithTitle(windows: [SCWindow], pid: pid_t, title: String?) -> SCWindow? {
        guard let windowTitle = title, !windowTitle.isEmpty else { return nil }
        
        let matchingWindow = windows.first { window in
            window.owningApplication?.processID == pid &&
            (window.title == windowTitle || window.title?.contains(windowTitle) == true)
        }
        
        if let window = matchingWindow {
            let winTitle = window.title ?? "Untitled"
            Logger.info("Found matching window with title \"\(winTitle)\" and PID \(pid)")
            return window
        }
        
        Logger.info("No exact title match, trying any window with matching PID")
        return nil
    }
    
    private static func findWindowWithPID(windows: [SCWindow], pid: pid_t) -> SCWindow? {
        let window = windows.first { $0.owningApplication?.processID == pid }
        
        if let window = window {
            let winTitle = window.title ?? "Untitled"
            Logger.info("Found window with PID \(pid) – \"\(winTitle)\"")
        }
        
        return window
    }
}

// MARK: - Stream Output Delegate

@available(macOS 12.3, *)
class StreamOutputDelegate: NSObject, SCStreamOutput {
    let handler: (CMSampleBuffer, SCStreamOutputType) -> Void

    init(handler: @escaping (CMSampleBuffer, SCStreamOutputType) -> Void) {
        self.handler = handler
    }

    func stream(_ stream: SCStream,
                didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
                of outputType: SCStreamOutputType) {
        handler(sampleBuffer, outputType)
    }
}

// MARK: - Screen Capture Manager

@available(macOS 12.3, *)
actor ScreenCaptureManager {
    private var activeStream: SCStream?
    private var outputDelegate: StreamOutputDelegate?
    
    func createContentFilter(for window: SCWindow) -> SCContentFilter {
        let filter = SCContentFilter(desktopIndependentWindow: window)
        Logger.info("Successfully created content filter for window: \(window.windowID)")
        return filter
    }
    
    func startCapture(with filter: SCContentFilter) async throws {
        Logger.info("Setting up capture with filter")
        
        let config = createStreamConfiguration()
        let stream = SCStream(filter: filter, configuration: config, delegate: nil)
        
        activeStream = stream
        
        try await setupStreamOutput(for: stream)
        try await stream.startCapture()
        
        Logger.info("Capture started successfully with filter")
        print("READY")
        fflush(stdout)
    }
    
    func stopCapture() async {
        Logger.info("Stopping capture...")
        
        if let stream = activeStream {
            do {
                try await stream.stopCapture()
                Logger.info("Capture stopped successfully")
            } catch {
                Logger.error("Failed to stop capture: \(error.localizedDescription)")
            }
            activeStream = nil
        }
        outputDelegate = nil
    }
    
    private func createStreamConfiguration() -> SCStreamConfiguration {
        let config = SCStreamConfiguration()
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 fps is enough
        config.queueDepth = 1 // Minimal queue
        return config
    }
    
    private func setupStreamOutput(for stream: SCStream) async throws {
        Logger.info("Adding stream output")
        
        outputDelegate = StreamOutputDelegate { _, _ in
            // No-op: we don't need to process frames
        }
        
        guard let delegate = outputDelegate else {
            throw CLIError.captureSetupFailed("Failed to create output delegate")
        }
        
        do {
            try stream.addStreamOutput(delegate,
                                     type: .screen,
                                     sampleHandlerQueue: DispatchQueue.global())
        } catch {
            Logger.error("Failed to add stream output: \(error.localizedDescription)")
            throw CLIError.captureSetupFailed(error.localizedDescription)
        }
    }
}

// MARK: - Signal Handler

@available(macOS 12.3, *)
struct SignalHandler {
    private static var captureManager: ScreenCaptureManager?
    
    static func setup(captureManager: ScreenCaptureManager) {
        // Store the capture manager in a static variable
        self.captureManager = captureManager
        
        for sig in [SIGINT, SIGTERM] {
            signal(sig) { signal in
                Logger.info("Received signal \(signal), shutting down...")
                
                Task {
                    await SignalHandler.captureManager?.stopCapture()
                    
                    Logger.info("Stopping CFRunLoop...")
                    DispatchQueue.main.async {
                        CFRunLoopStop(CFRunLoopGetMain())
                    }
                }
                
                sleep(1) // Give the task a chance to complete
            }
        }
    }
}

// MARK: - Run Loop Manager

struct RunLoopManager {
    static func runMainRunLoop() {
        Logger.info("Starting run loop on main thread")
        
        autoreleasepool {
            CFRunLoopRun()
        }
        
        Logger.info("Run loop stopped, process exiting")
    }
}

// MARK: - Main CLI

@available(macOS 12.3, *)
@main
actor ScreenFilterCLI {
    static func main() async {
        do {
            try await run()
        } catch {
            if let cliError = error as? CLIError {
                fputs("ERROR: \(cliError.localizedDescription)\n", stderr)
            } else {
                fputs("ERROR: \(error.localizedDescription)\n", stderr)
            }
            exit(2)
        }
    }
    
    private static func run() async throws {
        Logger.info("ScreenFilterCLI starting...")
        Logger.info("Arguments: \(CommandLine.arguments)")
        
        // Parse command line arguments
        let config = try CommandLineConfig(arguments: CommandLine.arguments)
        
        // Initialize components
        let captureManager = ScreenCaptureManager()
        
        // Setup signal handlers for clean shutdown
        SignalHandler.setup(captureManager: captureManager)
        
        Logger.info("Setting up window exclusion for PID: \(config.processID), title: \(config.windowTitle ?? "any")")
        
        // Check permissions
        Logger.info("Checking permissions...")
        try PermissionManager.checkAndRequestPermission()
        
        // Initialize CoreGraphics early to prevent CGS_REQUIRE_INIT assertion failures
        let _ = CGMainDisplayID()
        Logger.info("CoreGraphics initialized via CGMainDisplayID()")

        // Setup capture
        try await setupCapture(config: config, captureManager: captureManager)
        
        Logger.info("Exclusion complete; helper now running indefinitely")
        
        // Start main run loop
        await startMainRunLoop()
    }
    
    private static func setupCapture(config: CommandLineConfig, captureManager: ScreenCaptureManager) async throws {
        let window = try await WindowFinder.findWindow(pid: config.processID, title: config.windowTitle)
        let filter = await captureManager.createContentFilter(for: window)
        try await captureManager.startCapture(with: filter)
    }
    
    private static func startMainRunLoop() async {
        Logger.info("Entering main run loop")
        
        // Dispatch to the main thread to call CFRunLoopRun
        DispatchQueue.main.async {
            RunLoopManager.runMainRunLoop()
        }
        
        // Keep this task alive until the runloop exits
        while true {
            try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
        }
    }
} 