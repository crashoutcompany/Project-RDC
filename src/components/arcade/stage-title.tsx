import { Tag } from "./ui";

/**
 * "Fighter select" banner. Decorative: the page's h1 is a static sr-only
 * marker in the shell, so this renders identically in the loading skeleton
 * and in the streamed stage without shifting layout.
 */
export function StageTitle() {
  return (
    <div aria-hidden className="text-center">
      <Tag tone="green" className="text-3xl">
        who&apos;s the best gamer?
      </Tag>
      <p className="ac-title text-ac-cream animate-slam-in mt-4 text-2xl md:text-4xl">
        Fighter select
      </p>
    </div>
  );
}
