import { auth } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Icon from "@/app/favicon.ico";
import { H1 } from "@/components/headings";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Image from "next/image";
import { redirect } from "next/navigation";

// import { Session } from "next-auth";
import prisma from "prisma/db";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { headers } from "next/headers";

export default async function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <Component />
    </Suspense>
  );
}

const Component = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  
  // ... session.user.email ...

  if (!session) redirect("/");

  // Mask email for privacy
  const maskedEmail = session?.user?.email
    ? session.user.email.replace(/(.{2}).+(@.+)/, "$1***$2")
    : "";

  // Query all sessions submitted by the current user (by email)
  const userSessions = await prisma.session.findMany({
    where: { createdBy: session.user?.email || "" },
    select: {
      sessionId: true,
      sessionName: true,
      videoId: true,
      thumbnail: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto mt-16 max-w-3xl rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-200 p-8 shadow-xl dark:border-[#23232a] dark:from-[#18181b] dark:to-[#23232a]">
      <div className="flex flex-col items-center gap-8 md:flex-row">
        <Avatar className="ring-chart-4 h-40 w-40 shadow-lg ring-4">
          <AvatarImage src={session?.user?.image || Icon.src} />
          <AvatarFallback className="bg-chart-4 text-3xl text-white">
            {session?.user?.name?.[0] || "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <H1 className="text-chart-4 mb-2 text-4xl font-bold">
            {session?.user?.name}
          </H1>
          <div className="flex items-center gap-2 text-lg text-slate-600 dark:text-slate-300">
            <span className="font-semibold">Email:</span>
            <span className="rounded bg-slate-100 px-2 py-1 font-mono dark:bg-[#23232a]">
              {maskedEmail}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-10">
        <ProfileTabs userSessions={userSessions} />
      </div>
    </div>
  );
};

function ProfileTabs({
  userSessions,
}: {
  userSessions: {
    sessionId: number;
    sessionName: string;
    videoId: string;
    thumbnail: string;
  }[];
}) {
  return (
    <Tabs defaultValue="submissions" className="bg-transparent">
      <TabsList className="bg-inherit">
        <TabsTrigger
          className="data-[state=active]:bg-chart-4 cursor-pointer"
          value="submissions"
        >
          Submissions
        </TabsTrigger>
        <TabsTrigger
          className="data-[state=active]:bg-chart-4 cursor-pointer"
          value="settings"
        >
          Settings
        </TabsTrigger>
        <TabsTrigger
          className="data-[state=active]:bg-chart-4 cursor-pointer"
          value="favorites"
        >
          Favorites
        </TabsTrigger>
      </TabsList>
      <TabsContent value="submissions">
        {userSessions.length === 0 ? (
          <div className="text-slate-500">No submissions yet.</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {userSessions.map((session) => (
              <div key={session.sessionId}>
                <Image
                  className=""
                  src={session.thumbnail}
                  alt={session.sessionName}
                  width={400}
                  height={225}
                />
                <div>{session.sessionName}</div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
      <TabsContent value="settings">
        <div>Settings content</div>
        <DialogDemo />
      </TabsContent>
      <TabsContent value="favorites">
        <div>Favorites content</div>
      </TabsContent>
    </Tabs>
  );
}

function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="cursor-pointer" variant="destructive">
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="select-none">
            You can change your profile settings here. Make sure to save all
            changes before leaving this page.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
