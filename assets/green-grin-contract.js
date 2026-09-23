(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.GreenGrinContract = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BUSINESS_NAME = "Green Grin Lawns";
  const CONTRACT_VERSION = "2026-08-19";
  const CONTRACT_TEMPLATES = {
    landscaping: { label: "Landscaping project", title: "LANDSCAPING CUSTOMER CONTRACT" },
    mowing: { label: "Mowing service", title: "Recurring Lawn Mowing Agreement" },
    cleanup: { label: "Cleanup / hauling", title: "Property Cleanup and Hauling Agreement" },
    aeration: { label: "Aeration service", title: "Lawn Aeration Service Agreement" },
    custom: { label: "Custom service", title: "Green Grin Service Agreement" }
  };

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function money(value) {
    return Math.round(number(value) * 100) / 100;
  }

  function paymentSchedule(total, initialPercent = 50) {
    const projectTotal = money(total);
    const normalizedInitialPercent = Math.min(100, Math.max(0, Number.isFinite(Number(initialPercent)) ? Number(initialPercent) : 50));
    const initialPayment = money(projectTotal * normalizedInitialPercent / 100);
    return {
      project_total: projectTotal,
      initial_payment: initialPayment,
      final_payment: money(projectTotal - initialPayment),
      initial_percent: normalizedInitialPercent,
      final_percent: money(100 - normalizedInitialPercent)
    };
  }

  function normalizeContractSections(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 40).map((section) => {
      const title = String(section?.title || "").trim().slice(0, 160);
      const paragraphs = Array.isArray(section?.paragraphs)
        ? section.paragraphs.map((paragraph) => String(paragraph || "").trim().slice(0, 8000)).filter(Boolean).slice(0, 12)
        : [];
      const bullets = Array.isArray(section?.bullets)
        ? section.bullets.map((bullet) => String(bullet || "").trim().slice(0, 2000)).filter(Boolean).slice(0, 20)
        : [];
      return { title, paragraphs, bullets };
    }).filter((section) => section.title && (section.paragraphs.length || section.bullets.length));
  }

  function contractSections(disclosureRequired, template = "landscaping") {
    const type = CONTRACT_TEMPLATES[template] ? template : "landscaping";
    const serviceTerms = {
      mowing: {
        title: "Mowing Service Terms",
        paragraphs: ["Mowing service covers the recurring visits and service items listed in this agreement. Grass growth, weather, access, gates, pets, and site conditions can affect the exact service date.", "The Customer is responsible for keeping the lawn accessible and removing toys, hoses, pet waste, and other items before each scheduled visit.", "Green Grin Lawns will mow the agreed lawn areas, trim accessible edges, and blow hard surfaces clear of normal clippings. Additional work such as overgrowth recovery, shrub trimming, leaf cleanup, irrigation repair, or hauling requires separate approval."]
      },
      cleanup: {
        title: "Cleanup and Hauling Terms",
        paragraphs: ["Cleanup and hauling covers only the materials, areas, loads, and disposal described in the approved proposal. Hidden, hazardous, regulated, or unusually heavy material is excluded unless added by written Change Order.", "The Customer authorizes Green Grin Lawns to load and dispose of approved material at a lawful disposal location."]
      },
      aeration: {
        title: "Aeration Service Terms",
        paragraphs: ["Aeration service covers the lawn areas and number of visits listed in the approved proposal. Aeration loosens compacted soil but does not guarantee germination, weed control, or recovery from drought, disease, pests, or improper watering.", "The Customer will mark or disclose irrigation, utility, drainage, pet fence, and other concealed lines before service."]
      },
      custom: {
        title: "Service-Specific Terms",
        paragraphs: ["The service details, limits, materials, schedule, and completion standard are the items written in the approved proposal and any approved Change Orders."]
      }
    };
    if (type === "mowing") {
      return [
        {
          title: "Client and Property Information",
          paragraphs: [
            "This Service Agreement applies to the client, service address, billing address, and contact information shown in the approved proposal."
          ]
        },
        {
          title: "1. Work to Be Performed",
          paragraphs: [
            "Lawn Maintenance Bundle: includes lawn mowing, string trimming, and blowing of hard surfaces.",
            "Spring / Fall Clean-Up: includes leaf removal, bed cleanup, and lawn debris removal.",
            "Other Custom Work: only the work written in the approved proposal or an approved change order.",
            "Service frequency is the frequency selected in the approved proposal: weekly, bi-weekly, or as requested."
          ]
        },
        {
          title: "2. Price and Payment",
          paragraphs: [
            "The rate per visit and selected billing option are shown in the approved proposal or customer account.",
            "Billing may be per service, invoiced upon completion, or monthly, invoiced at the beginning of the month for that month's scheduled services."
          ]
        },
        {
          title: "3. Payment Terms",
          paragraphs: [
            "Invoices are sent via email. Monthly accounts are invoiced at the beginning of the month for that month's scheduled services.",
            "Unpaid balances 15 days past the invoice date are subject to a late fee of $15.00 or 1.5% of the outstanding balance per month, whichever is greater. Green Grin Lawns reserves the right to stop service on accounts with past-due balances."
          ]
        },
        {
          title: "4. Scheduling and Weather",
          paragraphs: [
            "Services are organized by route efficiency. While Green Grin Lawns aims for a consistent scheduled day, service dates are flexible to accommodate weather shifts, seasonal growth rates, holidays, or necessary equipment maintenance."
          ]
        },
        {
          title: "5. Property Access and Gates",
          paragraphs: [
            "The Client must ensure that gates are unlocked, paths are clear, and pets are indoors on service days. If the crew cannot access the yard or conditions are unsafe, a $25.00 trip fee applies, or the service may be billed at the standard rate."
          ]
        },
        {
          title: "6. Yard Debris",
          paragraphs: [
            "To avoid equipment damage and ensure an even cut, the Client must clear the lawn of toys, rocks, hoses, and large sticks before crew arrival."
          ]
        },
        {
          title: "7. Pet Waste",
          paragraphs: [
            "All animal waste must be removed from the service area before arrival. If pet waste is left on the lawn, Green Grin Lawns may perform a cleanup prior to mowing for an additional $15.00 charge, mow around the affected zones at the regular rate, or skip the service visit while billing the regular rate."
          ]
        },
        {
          title: "8. Underground Systems and Property Damage",
          paragraphs: [
            "Green Grin Lawns is fully insured. We are not responsible for damage to items left on the grass or to unmapped or shallowly buried systems, including invisible pet fences, shallow wiring, or shallow sprinkler heads. The Client must notify Green Grin Lawns of hidden property features before work begins."
          ]
        },
        {
          title: "9. Cancellation",
          paragraphs: [
            "This is an ongoing seasonal partnership. Either party may cancel or change this agreement at any time by giving 7-day written or verbal notice."
          ]
        },
        {
          title: "10. Assignment and Subcontracting",
          paragraphs: [
            "Green Grin Lawns reserves the right to assign, delegate, or subcontract any portion of the yard services to qualified independent contractors, associates, or service partners at its discretion."
          ]
        },
        {
          title: "Signatures and Authorization",
          paragraphs: [
            "The electronic signature on this agreement confirms that the Client reviewed and authorized the selected services, frequency, price, billing option, and terms above."
          ]
        }
      ];
    }
    const paymentParagraphs = type === "mowing"
      ? [
        "Recurring mowing is billed at the service price shown in the approved proposal or invoice. Payment is due according to the billing schedule stated on the customer account. A missed or failed payment may pause future service until the account is current.",
        "The recurring price assumes normal mowing conditions and the service frequency shown in the account. Significant overgrowth, blocked access, unusually heavy debris, or requested extra work may require a separately approved charge."
      ]
      : [
        `The initial payment shown in the approved proposal is due upon signing and must be received before ${BUSINESS_NAME} schedules work, orders project materials, or begins the Project. The remaining balance is due upon substantial completion.`,
        `${BUSINESS_NAME}' internal costs, margins, supplier pricing, and material acquisition costs are confidential business information and are not part of the Customer's pricing information.`
      ];
    const sections = [
      {
        title: "Agreement",
        paragraphs: [
          `This ${CONTRACT_TEMPLATES[type].title}, together with the approved proposal, is the agreement between ${BUSINESS_NAME} and the Customer. It becomes binding when the Customer signs electronically and ${BUSINESS_NAME} accepts the signed contract.`,
          `The approved scope, measurements, plans, written specifications, customer-facing price summary, and approved written change orders are incorporated into this contract.`
        ]
      },
      {
        title: "Scope of Work",
        paragraphs: [
          `${BUSINESS_NAME} will perform the ${CONTRACT_TEMPLATES[type].label.toLowerCase()} work described in the approved scope. Work not specifically included is excluded.`,
          "Excluded work includes major excavation, unforeseen underground conditions, utility relocation, major drainage correction, electrical or plumbing work, hazardous materials, and work requested after signing unless added by an approved Change Order."
        ]
      },
      {
        title: "Project Price and Payment",
        paragraphs: paymentParagraphs
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

    if (serviceTerms[type]) sections.splice(2, 0, serviceTerms[type]);

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
        "By signing, the Customer confirms that the Customer has reviewed and agrees to the approved scope, price, payment schedule, warranty, exclusions, and all terms of this Landscaping Customer Contract."
      ]
    });
    return sections;
  }

  function buildContract(estimate = {}, options = {}) {
    const total = number(estimate.total);
    const disclosureRequired = total > 2000;
    const registrationNumber = String(options.registrationNumber || estimate.contractor_registration_number || "").trim();
    const sentDate = estimate.proposal_sent_at || estimate.contract_date || new Date().toISOString();
    const template = String(options.contractTemplate || estimate.contract_template || "landscaping").toLowerCase();
    const defaultSections = contractSections(disclosureRequired, template);
    const customSections = normalizeContractSections(options.contractSections || estimate.contract_sections);
    const sections = customSections.length ? customSections : defaultSections;
    if (customSections.length && disclosureRequired && !customSections.some((section) => /residential contractor disclosure/i.test(section.title))) {
      const disclosure = defaultSections.find((section) => /residential contractor disclosure/i.test(section.title));
      if (disclosure) sections.push(disclosure);
    }
    const agreementName = CONTRACT_TEMPLATES[template]?.title || CONTRACT_TEMPLATES.landscaping.title;
    const defaultConsent = `I have reviewed and agree to this ${agreementName}, including the approved service scope, price, payment terms, warranty, exclusions, and Change Order terms. I authorize ${BUSINESS_NAME} to perform the described work.${disclosureRequired ? " I also acknowledge receipt, before signing, of the Idaho Residential Contractor Disclosure included in this contract." : ""}`;
    const consentText = String(options.consentText || estimate.contract_consent_text || defaultConsent).trim().slice(0, 8000);
    return {
      version: CONTRACT_VERSION,
      title: CONTRACT_TEMPLATES[template]?.title || CONTRACT_TEMPLATES.landscaping.title,
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
      pricing: paymentSchedule(total, options.initialPaymentPercent ?? estimate.initial_payment_percent),
      disclosure_required: disclosureRequired,
      sections,
      consent_text: consentText
    };
  }

  return {
    BUSINESS_NAME,
    CONTRACT_VERSION,
    CONTRACT_TEMPLATES,
    paymentSchedule,
    contractSections,
    normalizeContractSections,
    buildContract
  };
});
