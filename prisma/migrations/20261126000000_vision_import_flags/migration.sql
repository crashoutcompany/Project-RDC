-- CreateEnum
CREATE TYPE "VisionFlagStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CORRECTED', 'REJECTED');

-- CreateTable
CREATE TABLE "vision_import_flags" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "set_index" INTEGER NOT NULL,
    "match_index" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "read_value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "VisionFlagStatus" NOT NULL DEFAULT 'PENDING',
    "corrected_value" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vision_import_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vision_import_flags_session_id_status_idx" ON "vision_import_flags"("session_id", "status");

-- CreateIndex
CREATE INDEX "vision_import_flags_player_id_idx" ON "vision_import_flags"("player_id");

-- AddForeignKey
ALTER TABLE "vision_import_flags" ADD CONSTRAINT "vision_import_flags_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vision_import_flags" ADD CONSTRAINT "vision_import_flags_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("player_id") ON DELETE CASCADE ON UPDATE CASCADE;

