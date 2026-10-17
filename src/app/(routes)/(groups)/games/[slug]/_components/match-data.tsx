import { useMemo, useState } from "react";
import { getAllSessionsByGame } from "prisma/lib/admin";
import { SetData } from "./set-data";
import { QueryResponseData } from "prisma/db";
import { getSetsData } from "@/lib/mvp/process-sets";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type Sessions = QueryResponseData<
  Awaited<ReturnType<typeof getAllSessionsByGame>>
>;

const MatchData = ({ session }: { session: Sessions[0] | undefined }) => {
  const sets = useMemo(() => {
    if (!session) return [];
    return getSetsData(session);
  }, [session]);
  const [currentSet, setCurrentSet] = useState(0);

  return (
    <div className="my-6">
      {sets.length > 0 && (
        <>
          <SetNavigation
            currentSet={currentSet}
            setCurrentSet={setCurrentSet}
            maxSets={sets.length}
          />
          <SetData
            set={sets[currentSet]}
            setIndex={currentSet}
            game={session?.Game.gameName}
          />
          <SetNavigation
            currentSet={currentSet}
            setCurrentSet={setCurrentSet}
            maxSets={sets.length}
          />
        </>
      )}
    </div>
  );
};
export default MatchData;

const SetNavigation = ({
  currentSet,
  setCurrentSet,
  maxSets,
}: {
  currentSet: number;
  setCurrentSet: React.Dispatch<React.SetStateAction<number>>;
  maxSets: number;
}) => {
  const getSetNumbers = () => {
    const numbers: (number | "...")[] = [];
    const currentPage = currentSet + 1;
    const totalPages = maxSets;

    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    numbers.push(1);

    if (currentPage <= 3) {
      numbers.push(2, 3, "...", totalPages);
    } else if (currentPage >= totalPages - 2) {
      numbers.push("...", totalPages - 2, totalPages - 1, totalPages);
    } else {
      numbers.push(
        "...",
        currentPage - 1,
        currentPage,
        currentPage + 1,
        "...",
        totalPages,
      );
    }

    return numbers;
  };

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            onClick={() => currentSet > 0 && setCurrentSet((curr) => curr - 1)}
            className={
              currentSet === 0
                ? "pointer-events-none opacity-50"
                : "cursor-pointer"
            }
          />
        </PaginationItem>

        {getSetNumbers().map((setNumber, index) => {
          if (setNumber === "...") {
            return (
              <PaginationItem
                className="cursor-pointer"
                key={`ellipsis-${index}`}
              >
                <PaginationEllipsis />
              </PaginationItem>
            );
          }

          return (
            <PaginationItem key={setNumber}>
              <PaginationLink
                className="cursor-pointer"
                onClick={() => setCurrentSet(setNumber - 1)}
                isActive={currentSet === setNumber - 1}
              >
                {setNumber}
              </PaginationLink>
            </PaginationItem>
          );
        })}

        <PaginationItem>
          <PaginationNext
            onClick={() =>
              currentSet < maxSets - 1 && setCurrentSet((curr) => curr + 1)
            }
            className={
              currentSet === maxSets - 1
                ? "pointer-events-none opacity-50"
                : "cursor-pointer"
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
};
