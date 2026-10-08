import { findPlayer } from "@/app/(routes)/admin/_utils/player-mappings";
import { handlePrismaOperation } from "../db";
import { cacheLife, cacheTag } from "next/cache";
import "server-only";

export const getAllMembers = async () => {
  "use cache";
  cacheLife("max");
  cacheTag("getAllMembers");
  return await handlePrismaOperation((prisma) => prisma.player.findMany());
};

export const getMembersNav = async () => {
  const members = await getAllMembers();

  if (!members.success || !members.data) return [];

  const navMembers: {
    alt: string;
    name: string;
    navName: string;
    url: string;
    src: string;
    desc: string;
    stats: { prop: string; val: string }[];
  }[] = members.data.map((member) => {
    const rdcMember = findPlayer(member.playerName) ?? undefined;
    return {
      alt: rdcMember?.nav?.alt ?? member.playerName,
      name: member.playerName,
      navName: rdcMember?.nav?.name ?? member.playerName,
      url: rdcMember?.nav?.url ?? `/members/${member.playerName.toLowerCase()}`,
      src: rdcMember?.nav?.src ?? "",
      desc: rdcMember?.desc ?? "",
      stats: rdcMember?.stats ?? [],
    };
  });
  return navMembers;
};
