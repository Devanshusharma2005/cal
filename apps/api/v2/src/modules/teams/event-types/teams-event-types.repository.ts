import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { PrismaWriteService } from "@/modules/prisma/prisma-write.service";
import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
  PrismaClientInitializationError,
  PrismaClientRustPanicError,
} from "@prisma/client/runtime/library";

@Injectable()
export class TeamsEventTypesRepository {
  private readonly logger = new Logger("TeamsEventTypesRepository");

  constructor(private readonly dbRead: PrismaReadService, private readonly dbWrite: PrismaWriteService) {}

  async getTeamEventType(teamId: number, eventTypeId: number) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: {
          id: eventTypeId,
          teamId,
        },
        include: {
          users: true,
          schedule: true,
          hosts: true,
          destinationCalendar: true,
          calVideoSettings: true,
        },
      });
    } catch (error) {
      this.handleDatabaseError(
        error,
        `getTeamEventType for team ${teamId} and eventType ${eventTypeId}`,
        "Event type"
      );
    }
  }

  async getTeamEventTypeBySlug(teamId: number, eventTypeSlug: string, hostsLimit?: number) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: {
          teamId_slug: {
            teamId,
            slug: eventTypeSlug,
          },
        },
        include: {
          users: true,
          schedule: true,
          hosts: hostsLimit
            ? {
                take: hostsLimit,
              }
            : true,
          destinationCalendar: true,
          calVideoSettings: true,
          team: {
            select: {
              bannerUrl: true,
              name: true,
              logoUrl: true,
              slug: true,
              weekStart: true,
              brandColor: true,
              darkBrandColor: true,
              theme: true,
            },
          },
        },
      });
    } catch (error) {
      this.handleDatabaseError(
        error,
        `getTeamEventTypeBySlug for team ${teamId} and slug ${eventTypeSlug}`,
        "Event type"
      );
    }
  }

  async getEventTypeByTeamIdAndSlug(teamId: number, eventTypeSlug: string) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: {
          teamId_slug: {
            teamId,
            slug: eventTypeSlug,
          },
        },
      });
    } catch (error) {
      this.handleDatabaseError(
        error,
        `getEventTypeByTeamIdAndSlug for team ${teamId} and slug ${eventTypeSlug}`,
        "Event type"
      );
    }
  }

  async getEventTypeByTeamIdAndSlugWithOwnerAndTeam(teamId: number, eventTypeSlug: string) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: {
          teamId_slug: {
            teamId,
            slug: eventTypeSlug,
          },
        },
        include: { owner: true, team: true },
      });
    } catch (error) {
      this.handleDatabaseError(
        error,
        `getEventTypeByTeamIdAndSlugWithOwnerAndTeam for team ${teamId} and slug ${eventTypeSlug}`,
        "Event type"
      );
    }
  }

  async getTeamEventTypes(teamId: number) {
    try {
      return this.dbRead.prisma.eventType.findMany({
        where: {
          teamId,
        },
        include: {
          users: true,
          schedule: true,
          hosts: true,
          destinationCalendar: true,
          calVideoSettings: true,
          team: {
            select: {
              bannerUrl: true,
              name: true,
              logoUrl: true,
              slug: true,
              weekStart: true,
              brandColor: true,
              darkBrandColor: true,
              theme: true,
            },
          },
        },
      });
    } catch (error) {
      this.handleDatabaseError(error, `getTeamEventTypes for team ${teamId}`, "Event types");
    }
  }

  async getEventTypeById(eventTypeId: number) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: { id: eventTypeId },
        include: {
          users: true,
          schedule: true,
          hosts: true,
          destinationCalendar: true,
          calVideoSettings: true,
        },
      });
    } catch (error) {
      this.handleDatabaseError(error, `getEventTypeById for eventType ${eventTypeId}`, "Event type");
    }
  }

  async getEventTypeChildren(eventTypeId: number) {
    try {
      return this.dbRead.prisma.eventType.findMany({
        where: { parentId: eventTypeId },
        include: { users: true, schedule: true, hosts: true, destinationCalendar: true },
      });
    } catch (error) {
      this.handleDatabaseError(
        error,
        `getEventTypeChildren for eventType ${eventTypeId}`,
        "Event type children"
      );
    }
  }

  async getEventTypeByIdWithChildren(eventTypeId: number) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: { id: eventTypeId },
        include: { children: true },
      });
    } catch (error) {
      this.handleDatabaseError(
        error,
        `getEventTypeByIdWithChildren for eventType ${eventTypeId}`,
        "Event type"
      );
    }
  }

  async deleteUserManagedTeamEventTypes(userId: number, teamId: number) {
    try {
      return this.dbWrite.prisma.eventType.deleteMany({
        where: {
          parent: {
            teamId,
          },
          userId,
        },
      });
    } catch (error) {
      this.handleDatabaseError(
        error,
        `deleteUserManagedTeamEventTypes for user ${userId} and team ${teamId}`,
        "Event types"
      );
    }
  }

  async removeUserFromTeamEventTypesHosts(userId: number, teamId: number) {
    try {
      return this.dbWrite.prisma.host.deleteMany({
        where: {
          userId,
          eventType: {
            teamId,
          },
        },
      });
    } catch (error) {
      this.handleDatabaseError(
        error,
        `removeUserFromTeamEventTypesHosts for user ${userId} and team ${teamId}`,
        "Host assignments"
      );
    }
  }

  /**
   * Handles database errors by logging them and throwing user-safe exceptions
   * This prevents database schema details from being exposed to API consumers
   */
  private handleDatabaseError(error: unknown, operation: string, resourceType?: string): never {
    this.logger.error(`Database error in ${operation}`, error);

    // Handle Prisma-specific errors
    if (error instanceof PrismaClientKnownRequestError) {
      switch (error.code) {
        case "P2002": // Unique constraint failed
          throw new InternalServerErrorException("A resource with these details already exists.");
        case "P2025": // Record not found
          if (resourceType) {
            throw new InternalServerErrorException(`${resourceType} not found.`);
          }
          throw new InternalServerErrorException("The requested resource was not found.");
        case "P2003": // Foreign key constraint failed
          throw new InternalServerErrorException("Invalid reference - the related resource does not exist.");
        case "P2014": // Invalid ID
          throw new InternalServerErrorException("Invalid ID provided.");
        case "P2016": // Query interpretation error
          throw new InternalServerErrorException("Invalid query parameters provided.");
        default:
          this.logger.error(`Unhandled Prisma error code: ${error.code} - ${error.message}`);
          throw new InternalServerErrorException("Something went wrong. Please try again later.");
      }
    }

    // Handle other Prisma client errors
    if (
      error instanceof PrismaClientUnknownRequestError ||
      error instanceof PrismaClientValidationError ||
      error instanceof PrismaClientInitializationError ||
      error instanceof PrismaClientRustPanicError
    ) {
      this.logger.error(`Prisma client error in ${operation}`, error);
      throw new InternalServerErrorException("Something went wrong. Please try again later.");
    }

    // Handle generic errors
    if (error instanceof Error) {
      this.logger.error(`Generic error in ${operation}: ${error.message}`, error);
      throw new InternalServerErrorException("Something went wrong. Please try again later.");
    }

    // Fallback for unknown error types
    this.logger.error(`Unknown error in ${operation}`, error);
    throw new InternalServerErrorException("Something went wrong. Please try again later.");
  }
}
