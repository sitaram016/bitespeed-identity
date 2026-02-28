import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface IdentifyRequest {
  email?: string | null;
  phoneNumber?: string | null;
}

interface IdentifyResponse {
  contact: {
    primaryContactId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
  };
}

export async function identifyContact(
  req: IdentifyRequest
): Promise<IdentifyResponse> {
  const { email, phoneNumber } = req;

  if (!email && !phoneNumber) {
    throw new Error("At least one of email or phoneNumber must be provided");
  }

  // Step 1: Find all contacts matching the provided email OR phoneNumber
  const matchingContacts = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [
        ...(email ? [{ email }] : []),
        ...(phoneNumber ? [{ phoneNumber }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  // Step 2: No existing contact — create a new primary contact
  if (matchingContacts.length === 0) {
    const newContact = await prisma.contact.create({
      data: {
        email: email ?? null,
        phoneNumber: phoneNumber ?? null,
        linkedId: null,
        linkPrecedence: "primary",
      },
    });

    return buildResponse(newContact.id, [newContact], []);
  }

  // Step 3: Collect all linked contact clusters for every matching contact
  const allContactIds = new Set<number>();

  for (const contact of matchingContacts) {
    // Find the root primary for this contact
    const rootId =
      contact.linkPrecedence === "primary"
        ? contact.id
        : contact.linkedId!;

    allContactIds.add(rootId);
  }

  // Fetch ALL contacts across all clusters
  let allContacts = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [
        { id: { in: Array.from(allContactIds) } },
        { linkedId: { in: Array.from(allContactIds) } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  // Step 4: Determine the true primary (oldest createdAt among all primaries)
  const primaries = allContacts.filter(
    (c) => c.linkPrecedence === "primary"
  );
  primaries.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const truePrimary = primaries[0];
  const otherPrimaries = primaries.slice(1);

  // Step 5: Demote other primaries to secondary and re-link their secondaries
  if (otherPrimaries.length > 0) {
    for (const oldPrimary of otherPrimaries) {
      // Demote this primary to secondary under truePrimary
      await prisma.contact.update({
        where: { id: oldPrimary.id },
        data: {
          linkedId: truePrimary.id,
          linkPrecedence: "secondary",
          updatedAt: new Date(),
        },
      });

      // Re-link all contacts that were pointing to this old primary
      await prisma.contact.updateMany({
        where: {
          linkedId: oldPrimary.id,
          deletedAt: null,
        },
        data: {
          linkedId: truePrimary.id,
          updatedAt: new Date(),
        },
      });
    }

    // Refresh allContacts after updates
    allContacts = await prisma.contact.findMany({
      where: {
        deletedAt: null,
        OR: [
          { id: truePrimary.id },
          { linkedId: truePrimary.id },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
  }

  // Step 6: Check if the incoming request introduces new information
  const existingEmails = new Set(
    allContacts.map((c) => c.email).filter(Boolean)
  );
  const existingPhones = new Set(
    allContacts.map((c) => c.phoneNumber).filter(Boolean)
  );

  const isNewEmail = email && !existingEmails.has(email);
  const isNewPhone = phoneNumber && !existingPhones.has(phoneNumber);

  // Only create a new secondary if BOTH conditions are met:
  // 1. There is genuinely new information (new email or phone not in cluster)
  // 2. The request has BOTH email and phone — otherwise it would already be matched above
  const hasNewInfo = isNewEmail || isNewPhone;
  const hasBothFields = email && phoneNumber;

  if (hasNewInfo && hasBothFields) {
    const newSecondary = await prisma.contact.create({
      data: {
        email: email ?? null,
        phoneNumber: phoneNumber ?? null,
        linkedId: truePrimary.id,
        linkPrecedence: "secondary",
      },
    });
    allContacts.push(newSecondary);
  }

  // Step 7: Build final response
  const secondaries = allContacts.filter((c) => c.linkPrecedence === "secondary");
  return buildResponse(truePrimary.id, allContacts, secondaries.map((c) => c.id));
}

function buildResponse(
  primaryId: number,
  allContacts: Array<{
    id: number;
    email: string | null;
    phoneNumber: string | null;
    linkPrecedence: string;
  }>,
  secondaryIds: number[]
): IdentifyResponse {
  // Primary contact first, then secondaries — deduplicated
  const primary = allContacts.find((c) => c.id === primaryId)!;
  const rest = allContacts.filter((c) => c.id !== primaryId);

  const emails: string[] = [];
  const phoneNumbers: string[] = [];

  // Add primary's values first
  if (primary.email) emails.push(primary.email);
  if (primary.phoneNumber) phoneNumbers.push(primary.phoneNumber);

  // Add secondary values (deduplicated)
  for (const c of rest) {
    if (c.email && !emails.includes(c.email)) emails.push(c.email);
    if (c.phoneNumber && !phoneNumbers.includes(c.phoneNumber))
      phoneNumbers.push(c.phoneNumber);
  }

  return {
    contact: {
      primaryContactId: primaryId,
      emails,
      phoneNumbers,
      secondaryContactIds: secondaryIds,
    },
  };
}

export { prisma };
