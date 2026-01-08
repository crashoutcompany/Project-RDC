import { H1 } from "@/components/headings";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="container mx-auto py-8">
      <H1 className="mb-6 text-center">About Us</H1>
      <div className="prose dark:prose-invert mx-auto max-w-2xl text-lg leading-relaxed">
        <p className="mb-4">
          Welcome to Project RDC! We are dedicated to providing a platform for
          our community to connect, compete, and track their gaming progress.
          Our goal is to foster a vibrant and engaging environment for all
          members.
        </p>
        <p className="mb-4">
          This project is built with Next.js, React, and Tailwind CSS,
          leveraging modern web technologies to deliver a fast and responsive
          user experience. We are constantly working to improve and expand our
          features.
        </p>
        <p className="mb-4">
          If you encounter any issues, bugs, or have suggestions for new
          features, please feel free to report them on our GitHub repository.
          Your feedback is invaluable in helping us make Project RDC even
          better!
        </p>
        <p className="text-center">
          <Link
            href="https://github.com/tydolla00/Project-RDC/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            Report an issue on GitHub
          </Link>
        </p>
      </div>
    </div>
  );
}
