import {
  BadRequestException,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from "@nestjs/common";
import { Logger } from "@nestjs/common";
import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
  PrismaClientInitializationError,
  PrismaClientRustPanicError,
} from "@prisma/client/runtime/library";

import { CreateBookingInput } from "@calcom/platform-types";

@Injectable()
export class ErrorsBookingsService_2024_08_13 {
  private readonly logger = new Logger("ErrorsBookingsService_2024_08_13");

  handleEventTypeToBeBookedNotFound(body: CreateBookingInput): never {
    if (body.username && body.eventTypeSlug && !body.organizationSlug) {
      throw new NotFoundException(
        `Event type with slug ${body.eventTypeSlug} belonging to user ${body.username} not found.`
      );
    }
    if (body.username && body.eventTypeSlug && body.organizationSlug) {
      throw new NotFoundException(
        `Event type with slug ${body.eventTypeSlug} belonging to user ${body.username} within organization ${body.organizationSlug} not found.`
      );
    }
    if (body.teamSlug && body.eventTypeSlug && !body.organizationSlug) {
      throw new NotFoundException(
        `Event type with slug ${body.eventTypeSlug} belonging to team ${body.teamSlug} not found.`
      );
    }
    if (body.teamSlug && body.eventTypeSlug && body.organizationSlug) {
      throw new NotFoundException(
        `Event type with slug ${body.eventTypeSlug} belonging to team ${body.teamSlug} within organization ${body.organizationSlug} not found.`
      );
    }
    throw new NotFoundException(`Event type with id ${body.eventTypeId} not found.`);
  }

  handleBookingError(error: unknown, bookingTeamEventType: boolean): never {
    const hostsUnavaile = "One of the hosts either already has booking at this time or is not available";

    if (error instanceof Error) {
      if (error.message === "no_available_users_found_error") {
        if (bookingTeamEventType) {
          throw new BadRequestException(hostsUnavaile);
        }
        throw new BadRequestException("User either already has booking at this time or is not available");
      } else if (error.message === "booking_time_out_of_bounds_error") {
        throw new BadRequestException(
          `The event type can't be booked at the "start" time provided. This could be because it's too soon (violating the minimum booking notice) or too far in the future (outside the event's scheduling window). Try fetching available slots first using the GET /v2/slots endpoint and then make a booking with "start" time equal to one of the available slots: https://cal.com/docs/api-reference/v2/slots`
        );
      } else if (error.message === "Attempting to book a meeting in the past.") {
        throw new BadRequestException("Attempting to book a meeting in the past.");
      } else if (error.message === "hosts_unavailable_for_booking") {
        throw new BadRequestException(hostsUnavaile);
      }
    }
    throw error;
  }

  /**
   * Handles database errors by logging them and throwing user-safe exceptions
   * This prevents database schema details from being exposed to API consumers
   */
  handleDatabaseError(error: unknown, operation: string, resourceType?: string): never {
    this.logger.error(`Database error in ${operation}`, error);

    // Handle Prisma-specific errors
    if (error instanceof PrismaClientKnownRequestError) {
      switch (error.code) {
        case "P2002": // Unique constraint failed
          throw new BadRequestException("A resource with these details already exists.");
        case "P2025": // Record not found
          if (resourceType) {
            throw new NotFoundException(`${resourceType} not found.`);
          }
          throw new NotFoundException("The requested resource was not found.");
        case "P2003": // Foreign key constraint failed
          throw new BadRequestException("Invalid reference - the related resource does not exist.");
        case "P2014": // Invalid ID
          throw new BadRequestException("Invalid ID provided.");
        case "P2016": // Query interpretation error
          throw new BadRequestException("Invalid query parameters provided.");
        case "P2021": // Table does not exist
        case "P2022": // Column does not exist
          this.logger.error(`Database schema error: ${error.code} - ${error.message}`);
          throw new InternalServerErrorException("Something went wrong. Please try again later.");
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
      // Don't expose the original error message as it might contain sensitive information
      this.logger.error(`Generic error in ${operation}: ${error.message}`, error);
      throw new InternalServerErrorException("Something went wrong. Please try again later.");
    }

    // Fallback for unknown error types
    this.logger.error(`Unknown error in ${operation}`, error);
    throw new InternalServerErrorException("Something went wrong. Please try again later.");
  }
}
