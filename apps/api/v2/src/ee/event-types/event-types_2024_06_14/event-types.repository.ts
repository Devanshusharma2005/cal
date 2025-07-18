import { InputEventTransformed_2024_06_14 } from "@/ee/event-types/event-types_2024_06_14/transformed";
import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { PrismaWriteService } from "@/modules/prisma/prisma-write.service";
import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
  PrismaClientInitializationError,
  PrismaClientRustPanicError,
} from "@prisma/client/runtime/library";

@Injectable()
export class EventTypesRepository_2024_06_14 {
  private readonly logger = new Logger("EventTypesRepository_2024_06_14");

  constructor(private readonly dbRead: PrismaReadService, private readonly dbWrite: PrismaWriteService) {}

  async createUserEventType(
    userId: number,
    body: Omit<InputEventTransformed_2024_06_14, "destinationCalendar">
  ) {
    const { calVideoSettings, ...restBody } = body;

    try {
      return this.dbWrite.prisma.eventType.create({
        data: {
          ...restBody,
          userId,
          locations: body.locations,
          bookingFields: body.bookingFields,
          users: { connect: { id: userId } },
          ...(calVideoSettings && {
            calVideoSettings: {
              create: calVideoSettings,
            },
          }),
        },
      });
    } catch (error) {
      this.handleDatabaseError(error, `createUserEventType for user ${userId}`, "Event type");
    }
  }

  async getEventTypeWithSeats(eventTypeId: number) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: { id: eventTypeId },
        select: {
          users: { select: { id: true } },
          seatsPerTimeSlot: true,
          locations: true,
          requiresConfirmation: true,
        },
      });
    } catch (error) {
      this.handleDatabaseError(error, `getEventTypeWithSeats for eventType ${eventTypeId}`, "Event type");
    }
  }

  async getEventTypeWithMetaData(eventTypeId: number) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: { id: eventTypeId },
        select: { metadata: true },
      });
    } catch (error) {
      this.handleDatabaseError(error, `getEventTypeWithMetaData for eventType ${eventTypeId}`, "Event type");
    }
  }

  async getEventTypeWithHosts(eventTypeId: number) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: { id: eventTypeId },
        include: { hosts: true },
      });
    } catch (error) {
      this.handleDatabaseError(error, `getEventTypeWithHosts for eventType ${eventTypeId}`, "Event type");
    }
  }

  async getUserEventType(userId: number, eventTypeId: number) {
    try {
      return this.dbRead.prisma.eventType.findFirst({
        where: {
          id: eventTypeId,
          userId,
        },
        include: { users: true, schedule: true, destinationCalendar: true },
      });
    } catch (error) {
      this.handleDatabaseError(
        error,
        `getUserEventType for user ${userId} and eventType ${eventTypeId}`,
        "Event type"
      );
    }
  }

  async getUserEventTypes(userId: number) {
    try {
      return this.dbRead.prisma.eventType.findMany({
        where: {
          userId,
        },
        include: { users: true, schedule: true, destinationCalendar: true },
      });
    } catch (error) {
      this.handleDatabaseError(error, `getUserEventTypes for user ${userId}`, "Event types");
    }
  }

  async getEventTypeById(eventTypeId: number) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: { id: eventTypeId },
        include: { users: true, schedule: true, destinationCalendar: true, calVideoSettings: true },
      });
    } catch (error) {
      this.handleDatabaseError(error, `getEventTypeById for eventType ${eventTypeId}`, "Event type");
    }
  }

  async getEventTypeByIdIncludeUsersAndTeam(eventTypeId: number) {
    try {
      const eventType = await this.dbRead.prisma.eventType.findUnique({
        where: { id: eventTypeId },
        include: { users: true, team: true },
      });

      if (!eventType) {
        return null;
      }

      return {
        ...eventType,
        recurringEvent: eventType.recurringEvent as Prisma.JsonObject | null | undefined,
      };
    } catch (error) {
      this.handleDatabaseError(
        error,
        `getEventTypeByIdIncludeUsersAndTeam for eventType ${eventTypeId}`,
        "Event type"
      );
    }
  }

  async getEventTypeByIdWithOwnerAndTeam(eventTypeId: number) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: { id: eventTypeId },
        include: { owner: true, team: true },
      });
    } catch (error) {
      this.handleDatabaseError(
        error,
        `getEventTypeByIdWithOwnerAndTeam for eventType ${eventTypeId}`,
        "Event type"
      );
    }
  }

  async getUserEventTypeBySlug(userId: number, slug: string) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: {
          userId_slug: {
            userId: userId,
            slug: slug,
          },
        },
        include: { users: true, schedule: true, destinationCalendar: true },
      });
    } catch (error) {
      this.handleDatabaseError(
        error,
        `getUserEventTypeBySlug for user ${userId} and slug ${slug}`,
        "Event type"
      );
    }
  }

  async getUserEventTypeBySlugWithOwnerAndTeam(userId: number, slug: string) {
    try {
      return this.dbRead.prisma.eventType.findUnique({
        where: {
          userId_slug: {
            userId: userId,
            slug: slug,
          },
        },
        include: { owner: true, team: true },
      });
    } catch (error) {
      this.handleDatabaseError(
        error,
        `getUserEventTypeBySlugWithOwnerAndTeam for user ${userId} and slug ${slug}`,
        "Event type"
      );
    }
  }

  async deleteEventType(eventTypeId: number) {
    try {
      return this.dbWrite.prisma.eventType.delete({ where: { id: eventTypeId } });
    } catch (error) {
      this.handleDatabaseError(error, `deleteEventType for eventType ${eventTypeId}`, "Event type");
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
