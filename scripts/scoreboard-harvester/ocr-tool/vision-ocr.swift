//
// vision-ocr.swift
//
// Minimal CLI that runs Apple's Vision framework text recognition on a single
// image file and prints recognized text lines as a JSON string array on stdout.
// Daemon mode keeps one process alive, reading image paths from stdin and
// writing one JSON object per line: {"ok":true,"text":[...]} or
// {"ok":false,"error":"..."}.
// Game-agnostic: the keyword matching lives in TypeScript.
// Exits 0 on success, non-zero on failure (with diagnostic on stderr).
//
// Build:
//   swiftc -O vision-ocr.swift -o ../bin/vision-ocr
//
// Usage:
//   vision-ocr <image-path>
//   vision-ocr --daemon
//
// Output format (stdout):
//   ["WINNER","BLUE","3","GOALS","SHOTS",...]
//

import AppKit
import Foundation
import Vision

/**
 * Writes a diagnostic line to stderr.
 *
 * - Parameter message: The message to write.
 */
func writeStderr(_ message: String) {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
}

/**
 * Writes a JSON value followed by a newline to stdout.
 *
 * - Parameter value: JSON-serializable payload.
 */
func writeJsonLine(_ value: Any) throws {
    let payload = try JSONSerialization.data(withJSONObject: value, options: [])
    FileHandle.standardOutput.write(payload)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

/**
 * Runs Apple's Vision OCR on one image path.
 *
 * - Parameter imagePath: Absolute or relative image path.
 * - Returns: Recognized text lines, sorted top-to-bottom.
 */
func recognizeText(imagePath: String) throws -> [String] {
    guard
        let nsImage = NSImage(contentsOfFile: imagePath),
        let cgImage = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil)
    else {
        throw NSError(
            domain: "vision-ocr",
            code: 3,
            userInfo: [NSLocalizedDescriptionKey: "failed to load image: \(imagePath)"]
        )
    }

    let semaphore = DispatchSemaphore(value: 0)
    var recognizedLines: [String] = []
    var failure: Error? = nil

    let request = VNRecognizeTextRequest { req, err in
        defer { semaphore.signal() }
        if let err = err {
            failure = err
            return
        }
        let observations = req.results as? [VNRecognizedTextObservation] ?? []
        // Sort top-to-bottom for stable output. Vision returns observations roughly
        // in reading order, but we explicitly sort by y descending (origin is
        // bottom-left in Vision's normalized coordinates).
        let sorted = observations.sorted { a, b in
            a.boundingBox.origin.y > b.boundingBox.origin.y
        }
        recognizedLines = sorted.compactMap { $0.topCandidates(1).first?.string }
    }

    // Accurate is ~2x slower than .fast but dramatically better on stylized UI
    // text like the RL scoreboard. usesLanguageCorrection off because scoreboards
    // are short tokens / numbers, not natural language.
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]

    do {
        try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
    } catch {
        failure = error
        semaphore.signal()
    }

    semaphore.wait()

    if let failure = failure {
        throw failure
    }

    return recognizedLines
}

/**
 * Handles the original single-image CLI mode.
 *
 * - Parameter imagePath: Image path to OCR.
 */
func runSingle(imagePath: String) {
    do {
        let lines = try recognizeText(imagePath: imagePath)
        let payload = try JSONSerialization.data(withJSONObject: lines, options: [])
        FileHandle.standardOutput.write(payload)
    } catch {
        writeStderr(error.localizedDescription)
        exit(4)
    }
}

/**
 * Handles persistent worker mode. Each stdin line is an image path; each stdout
 * line is a JSON result object. EOF exits cleanly.
 */
func runDaemon() {
    while let imagePath = readLine(strippingNewline: true) {
        if imagePath.isEmpty {
            continue
        }
        do {
            let lines = try recognizeText(imagePath: imagePath)
            try writeJsonLine(["ok": true, "text": lines])
        } catch {
            do {
                try writeJsonLine(["ok": false, "error": error.localizedDescription])
            } catch {
                writeStderr(error.localizedDescription)
                exit(5)
            }
        }
    }
}

guard CommandLine.arguments.count >= 2 else {
    writeStderr("usage: vision-ocr <image> | vision-ocr --daemon")
    exit(2)
}

if CommandLine.arguments[1] == "--daemon" {
    runDaemon()
} else {
    runSingle(imagePath: CommandLine.arguments[1])
}
