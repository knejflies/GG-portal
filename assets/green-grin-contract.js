(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GreenGrinContract = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BUSINESS_NAME = "Green Grin Lawns";
  const CONTRACT_VERSION = "2026-08-19";

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return Math.round(number(value) * 100) / 100;
  }

  function paymentSchedule(total) {
    const projectTotal = money(total);
    const initialPayment = money(projectTotal / 2);
    return {
      project_total: projectTotal,
      initial_payment: initialPayment,
      final_payment: money(projectTotal - initialPayment),
      initial_percent: 50,
      final_percent: 50
    };
  }

  function contractSections(disclosureRequired) {
    const sections = [
      {
        title: "Agreement",
        paragraphs: [
          `This Landscaping Customer Contract, together with the approved proposal, is the agreement between ${BUSINESS_NAME} and the Customer. It becomes binding when the Customer signs electronically and ${BUSINESS_NAME} accepts the signed contract.`,
          `The approved scope, measurements, plans, written specifications, customer-facing price summary, and approved written change orders are incorporated into this contract.`
        ]
      },
      {
        title: "Scope of Work",
        paragraphs: [
          `${BUSINESS_NAME} will perform the landscaping work described in the approved scope. Work not specifically included is excluded.`,
          "Excluded work includes major excavation, unforeseen underground conditions, utility relocation, major drainage correction, electrical or plumbing work, hazardous materials, and work requested after signing unless added by an approved Change Order."
        ]
      },
      {
        title: "Project Price and Payment",
        paragraphs: [
          `The 50% initial payment is due upon signing and must be received before ${BUSINESS_NAME} schedules work, orders project materials, or begins the Project. The remaining 50% is due upon substantial completion.`,
          `${BUSINESS_NAME}' internal costs, margins, supplier pricing, and material acquisition costs are confidential business information and are not part of the Customer's pricing information.`
        ]
      },
      {
        title: "Change Orders",
        paragraphs: [
          "Work outside the approved scope requires Customer approval. A Change Order may increase or decrease the Project Total and may change the schedule.",
          "Change Orders may be approved by signed document, email, text message, or another written electronic communication that clearly identifies the additional or removed work and its price."
        ]
      },
      {
        title: "Scheduling and Weather",
        paragraphs: [
          `Start and completion dates are estimates. Weather, material availability, equipment issues, labor availability, unsafe conditions, utility issues, unforeseen site conditions, or circumstances outside ${BUSINESS_NAME}' reasonable control may delay the Project without constituting a breach of this contract.`
        ]
      },
      {
        title: "Property Access and Utilities",
        paragraphs: [
          "The Customer must provide reasonable access to the property and disclose known underground utilities, irrigation, electrical, drainage, septic, wells, and other concealed property features.",
          `${BUSINESS_NAME} is not responsible for damage to concealed, undisclosed, or improperly marked private utilities or property features that could not reasonably have been identified before work began.`
        ]
      },
      {
        title: "Cleanup and Disposal",
        paragraphs: [
          `${BUSINESS_NAME} will reasonably clean the immediate work area and remove normal project debris upon completion. Unusual, hazardous, buried, or excessive debris and disposal outside the approved scope may require a Change Order.`
        ]
      },
      {
        title: "365-Day Workmanship Warranty",
        paragraphs: [
          `${BUSINESS_NAME} provides a 365-day workmanship warranty beginning at substantial completion and, when appropriate, will repair covered workmanship issues reported within that period after having a reasonable opportunity to inspect the work.`,
          `The warranty period may be reasonably extended for affected warranty work when correction is delayed by weather, seasonal conditions, material availability, or circumstances outside ${BUSINESS_NAME}' reasonable control, or while ${BUSINESS_NAME} is actively correcting a covered issue.`,
          "The warranty does not cover damage caused by misuse, neglect, improper maintenance or watering, irrigation failure, weather or acts of nature, animals, pests, disease, normal settling or plant growth, third parties, modifications by others, pre-existing conditions, concealed conditions, or other circumstances outside reasonable control.",
          "Plant survival is not guaranteed unless a separate written plant warranty is provided."
        ]
      },
      {
        title: "Cancellation",
        paragraphs: [
          "Cancellation must be provided in writing. If the Customer cancels after signing, the Customer remains responsible for work performed, materials purchased or committed to the Project, approved Change Orders, and other properly incurred costs, subject to applicable law."
        ]
      },
      {
        title: "Nonpayment and Lien Rights",
        paragraphs: [
          `If payment is overdue, ${BUSINESS_NAME} may suspend work until the account is current. ${BUSINESS_NAME} reserves collection remedies available under Idaho law and, to the extent permitted by law, may pursue a construction lien for qualifying unpaid amounts.`,
          "The Customer agrees to reasonable collection costs and attorney fees to the extent permitted by law."
        ]
      },
      {
        title: "Electronic Signature",
        paragraphs: [
          "Electronic signatures, emails, text messages, and other written electronic communications may be used to approve this contract, Change Orders, and Project decisions to the extent permitted by law. Electronic signatures are intended to have the same effect as handwritten signatures."
        ]
      }
    ];

    if (disclosureRequired) {
      sections.push({
        title: "Idaho Residential Contractor Disclosure Receipt",
        paragraphs: [
          "Before entering this contract, the Customer acknowledges receiving the following disclosures for a residential project over $2,000:"
        ],
        bullets: [
          "The Customer may, at the Customer's reasonable expense, require lien waivers from subcontractors providing services or materials to the general contractor.",
          "The Customer may request proof that the general contractor has general liability insurance, including completed operations coverage, and workers' compensation insurance for employees as required by Idaho law.",
          "The Customer has the opportunity to purchase an extended title insurance policy covering certain unfiled or unrecorded liens.",
          "The Customer may, at the Customer's expense, require a surety bond in an amount up to the value of the construction project."
        ]
      });
    }

    sections.push({
      title: "Customer Acknowledgment",
      paragraphs: [
        "By signing, the Customer confirms that the Customer has reviewed and agrees to the approved scope, price, 50/50 payment schedule, warranty, exclusions, and all terms of this Landscaping Customer Contract."
      ]
    });
    return sections;
  }

  function buildContract(estimate = {}, options = {}) {
    const total = number(estimate.total);
    const disclosureRequired = total > 2000;
    const registrationNumber = String(options.registrationNumber || estimate.contractor_registration_number || "").trim();
    const sentDate = estimate.proposal_sent_at || estimate.contract_date || new Date().toISOString();
    return {
      version: CONTRACT_VERSION,
      title: "Landscaping Customer Contract",
      business: {
        name: BUSINESS_NAME,
        city: "Caldwell, Idaho",
        phone: "208-740-8837",
        email: "ken@greengrinlawns.com",
        contractor_registration_number: registrationNumber
      },
      customer: {
        name: String(estimate.customer_name || ""),
        phone: String(estimate.phone || ""),
        email: String(estimate.email || estimate.email_hint || ""),
        project_address: String(estimate.service_address || "")
      },
      project: {
        estimate_number: String(estimate.estimate_number || ""),
        title: String(estimate.project_title || "Landscape project"),
        scope: String(estimate.project_scope || ""),
        contract_date: sentDate,
        estimated_start: String(estimate.estimated_start || estimate.project_start_date || "To be scheduled"),
        estimated_completion: String(estimate.estimated_completion || estimate.project_completion_date || "To be scheduled")
      },
      pricing: paymentSchedule(total),
      disclosure_required: disclosureRequired,
      sections: contractSections(disclosureRequired),
      consent_text: `I have reviewed and agree to this Landscaping Customer Contract, including the approved scope, project price, 50% initial payment, 50% final payment, warranty, exclusions, and Change Order terms. I authorize ${BUSINESS_NAME} to perform the described work.${disclosureRequired ? " I also acknowledge receipt, before signing, of the Idaho Residential Contractor Disclosure included in this contract." : ""}`
    };
  }

  return {
    BUSINESS_NAME,
    CONTRACT_VERSION,
    paymentSchedule,
    contractSections,
    buildContract
  };
});
