import { buildCustomerWriteData } from "../customer-utils";

describe("customer write payload", () => {
  test("mirrors mobile fields into the canonical customer fields", () => {
    expect(buildCustomerWriteData({
      guid: " app_123 ",
      name: "  Asha Farms  ",
      phone: " 9876543210 ",
      address: "  Idukki  ",
      cropType: " Cardamom ",
      contactName: "  Anu  ",
      contactPhone: " 9999999999 ",
      latitude: 0,
      longitude: 77.25,
    })).toEqual({
      guid: "app_123",
      name: "Asha Farms",
      customer_name: "Asha Farms",
      phone: "9876543210",
      address: "Idukki",
      address_line_1: "Idukki",
      cropType: "Cardamom",
      contact_person: "Anu",
      mobile: "9999999999",
      latitude: 0,
      longitude: 77.25,
    });
  });

  test("keeps cleared optional fields in the JSON payload", () => {
    const data = buildCustomerWriteData({ name: "Asha", phone: "123" });

    expect(data).toMatchObject({
      address: "",
      address_line_1: "",
      cropType: "",
      contact_person: "",
      mobile: "",
    });
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});
