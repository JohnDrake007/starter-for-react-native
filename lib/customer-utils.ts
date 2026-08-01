export interface CustomerWriteInput {
  guid?: string;
  name: string;
  phone: string;
  address?: string;
  cropType?: string;
  contactName?: string;
  contactPhone?: string;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Build the customer shape shared by FieldAgent and the Tally integration.
 *
 * The collection contains both the original mobile fields (`name`, `address`)
 * and the canonical Tally fields (`customer_name`, `address_line_1`). Keeping
 * the pairs in lockstep prevents a mobile-created customer from looking blank
 * to consumers that read the Tally-shaped fields.
 *
 * Optional strings intentionally use an empty string instead of `undefined`.
 * Appwrite's JSON transport drops `undefined`, which previously meant clearing
 * an address, crop, or contact value never reached the server or offline queue.
 */
export function buildCustomerWriteData(input: CustomerWriteInput): Record<string, any> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const address = input.address?.trim() || "";
  const cropType = input.cropType?.trim() || "";
  const contactPerson = input.contactName?.trim() || "";
  const mobile = input.contactPhone?.trim() || "";

  const data: Record<string, any> = {
    name,
    customer_name: name,
    phone,
    address,
    address_line_1: address,
    cropType,
    contact_person: contactPerson,
    mobile,
  };

  const guid = input.guid?.trim();
  if (guid) data.guid = guid;
  if (Number.isFinite(input.latitude)) data.latitude = input.latitude;
  if (Number.isFinite(input.longitude)) data.longitude = input.longitude;

  return data;
}
