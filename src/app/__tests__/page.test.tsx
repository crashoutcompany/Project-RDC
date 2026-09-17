import { render, screen } from "@testing-library/react";
// import Page from "../page";
import About from "@/app/(routes)/about/page";

// describe("Page", () => {
//   xit("renders a heading", () => {
//     render(<Page />);

//     const heading = screen.getByRole("heading", { level: 1 });

//     expect(heading).toBeInTheDocument();
//   });
// });

describe("About page", () => {
  it("should display the heading", () => {
    render(<About />);

    const heading = screen.getByRole("heading", { level: 1 });

    expect(heading).toBeInTheDocument();
  });
});
