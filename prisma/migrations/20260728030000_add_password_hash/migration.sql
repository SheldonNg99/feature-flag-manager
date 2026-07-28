-- AlterTable: Add passwordHash column to users table
ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';
