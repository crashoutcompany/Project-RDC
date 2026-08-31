"use client";
import { H1, H3 } from "@/components/headings";
import { Avatar } from "@/components/ui/avatar";
import Image from "next/image";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import Icon from "@/app/favicon.ico";
import Link from "next/link";
import { FillText } from "@/components/fill-text";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Battle } from "./Battle";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import type { getMembersNav } from "prisma/lib/members";

type Member = Awaited<ReturnType<typeof getMembersNav>>[0];

interface MembersClientProps {
  members: Member[];
  showHeading?: boolean;
}

/**
 * True when HoverCard is safe: fine pointer, hover capability, and no touch.
 * `maxTouchPoints` covers Playwright mobile on Linux, where hover:hover can still match.
 */
function useCanHover(): boolean {
  const [canHover, setCanHover] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () =>
      setCanHover(navigator.maxTouchPoints === 0 && mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return canHover;
}

function MemberAvatarLink({ member }: { member: Member }) {
  return (
    <Link
      className="group/fill overflow-hidden"
      href={member.url}
      data-testid={`member-link-${member.name.toLowerCase()}`}
    >
      <Avatar className="h-32 w-32">
        <Image
          className="transition-transform duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:group-hover/fill:scale-125"
          alt={member.alt}
          src={member.src || Icon}
          height={128}
          width={128}
        />
      </Avatar>
      <div className="mx-auto w-fit">
        <FillText
          overrideGroup
          className="text-chart-4"
          text={member.name}
        />
      </div>
    </Link>
  );
}

export function MembersClient({
  members,
  showHeading = true,
}: MembersClientProps) {
  const [isBattleMode, setIsBattleMode] = useState(false);
  const canHover = useCanHover();

  return (
    <div className={showHeading ? "m-16" : undefined}>
      {isBattleMode ? (
        <Battle />
      ) : (
        <>
          {showHeading ? <H1>Members</H1> : null}
          <div className="flex flex-wrap justify-center gap-10">
            {members.map((rdc) =>
              canHover ? (
                <HoverCard key={rdc.name} openDelay={200} closeDelay={200}>
                  <HoverCardTrigger asChild>
                    <MemberAvatarLink member={rdc} />
                  </HoverCardTrigger>
                  <HoverCardContent align="center" side="right">
                    <H3>{rdc.name}</H3>
                    <i className="text-muted-foreground leading-7">
                      {rdc.desc}
                    </i>
                    {rdc.stats.map((stat, index) => (
                      <div key={index}>
                        <p className="mt-2 font-bold">{stat.prop}</p>
                        <p className="text-muted-foreground mb-6">{stat.val}</p>
                      </div>
                    ))}
                  </HoverCardContent>
                </HoverCard>
              ) : (
                <MemberAvatarLink key={rdc.name} member={rdc} />
              ),
            )}
          </div>
          <div className="mt-10 flex gap-10">
            <Card className="h-64 flex-1">
              <CardHeader>
                <CardTitle>Chart</CardTitle>
              </CardHeader>
            </Card>
            <Card className="h-64 flex-1">
              <CardHeader>
                <CardTitle>Chart</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </>
      )}

      <Button
        onClick={() => setIsBattleMode(!isBattleMode)}
        className="fixed right-8 bottom-8 z-50 shadow-lg"
        size="lg"
      >
        {isBattleMode ? "Exit Battle" : "Battle Mode"}
      </Button>
    </div>
  );
}
