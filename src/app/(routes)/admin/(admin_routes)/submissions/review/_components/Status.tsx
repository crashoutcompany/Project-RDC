import { EditStatus } from "@/generated/prisma/client";

export const Status = ({ status }: { status: EditStatus }) => {
  let color = "";
  switch (status) {
    case "PENDING":
      color = "bg-yellow-500";
      break;
    case "APPROVED":
      color = "bg-green-500";
      break;
    case "REJECTED":
      color = "bg-red-500";
      break;
    default:
      color = "bg-gray-500";
  }

  return (
    <div className={`absolute top-2 right-2 space-x-1`}>
      <div
        className={`inline-block size-3 animate-pulse rounded-full ${color}`}
      />
      <span className="text-sm">{status}</span>
    </div>
  );
};
