import { notFound } from "next/navigation";
import { getMember } from "./data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Image from "next/image";
import { getAllMembers } from "prisma/lib/members";
import { findPlayer } from "@/app/(routes)/admin/_utils/player-mappings";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { connection } from "next/server";

export async function generateStaticParams() {
  const members = await getAllMembers();
  if (!members.success || !members.data || members.data.length === 0) {
    console.error("Failed to fetch members");
    return [{ slug: "__placeholder__" }];
  }
  return members.data.map((member) => ({
    slug: member.playerName.toLowerCase(),
  }));
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <div className="container mx-auto p-4">
      <h1
        className="mb-4 text-3xl font-bold"
        data-testid="member-detail-shell-marker"
      >
        Member
      </h1>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <MemberDetailContent params={params} />
      </Suspense>
    </div>
  );
}

async function MemberDetailContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params;
  const member = await getMember(slug);

  if (!member.success || !member.data || slug === "__placeholder__") notFound();

  return (
    <Card data-testid="member-detail-content">
      <CardHeader>
        <div className="flex items-center gap-4">
          <Image
            src={findPlayer(member.data.playerName)?.image || ""}
            alt={member.data.playerName}
            width={100}
            height={100}
            className="rounded-full"
          />
          <div>
            <CardTitle className="text-4xl">{member.data.playerName}</CardTitle>
            <CardDescription>Member of RDC</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Win Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Matches Won: {member.data.matchWins.length}</p>
              <p>Sets Won: {member.data.setWins.length}</p>
              <p>Days Won: {member.data.dayWins.length}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
