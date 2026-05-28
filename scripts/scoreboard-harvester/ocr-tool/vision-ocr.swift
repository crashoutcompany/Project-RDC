//
// vision-ocr.swift
//
// Minimal CLI that runs Apple's Vision framework text recognition on a single
// image file and prints recognized text lines as a JSON string array on stdout.
// Game-agnostic: the keyword matching lives in TypeScript.
// Exits 0 on success, non-zero on failure (with diagnostic on stderr).
//
// Build:
//   swiftc -O vision-ocr.swift -o ../bin/vision-ocr
//
// Usage:
//   vision-ocr <image-path>
//
// Output format (stdout):
//   ["WINNER","BLUE","3","GOALS","SHOTS",...]
//

import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count >= 2 else {
    FileHandle.standardError.write(Data("usage: vision-ocr <image>\n".utf8))
    exit(2)
}

let imagePath = CommandLine.arguments[1]

guard
    let nsImage = NSImage(contentsOfFile: imagePath),
    let cgImage = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
    FileHandle.standardError.write(Data("failed to load image: \(imagePath)\n".utf8))
    exit(3)
}

let semaphore = DispatchSemaphore(value: 0)
var recognizedLines: [String] = []
var failure: String? = nil

let request = VNRecognizeTextRequest { req, err in
    defer { semaphore.signal() }
    if let err = err {
        failure = err.localizedDescription
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
    failure = error.localizedDescription
    semaphore.signal()
}

semaphore.wait()

if let failure = failure {
    FileHandle.standardError.write(Data("\(failure)\n".utf8))
    exit(4)
}

let payload = try JSONSerialization.data(withJSONObject: recognizedLines, options: [])
FileHandle.standardOutput.write(payload)
