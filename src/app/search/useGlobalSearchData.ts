// useGlobalSearchData — assembles the 13 searchable collections from the query
// cache for rankedSearch. Loading is real (isLoading of the underlying
// queries) — the UI shows an honest loading state, never an empty fake result.
import type {
  Course,
  Customer,
  CustomerPrinter,
  Document,
  KnowledgeNote,
  Lead,
  MemoryRecord,
  Organization,
  PrinterModel,
  Quotation,
  ServiceTicket,
  Student,
  Task,
} from "@/domain/types";
import type { RankedSearchData } from "@/domain/selectors";
import { useCollection } from "@/app/data/hooks";
import { scopeRecords } from "@/authorization/recordScope";
import { useScopeContext } from "@/authorization/useScope";

export interface GlobalSearchDataResult {
  data: RankedSearchData;
  isLoading: boolean;
}

export function useGlobalSearchData(): GlobalSearchDataResult {
  const customers = useCollection<Customer>("customers");
  const leads = useCollection<Lead>("leads");
  const organizations = useCollection<Organization>("organizations");
  const quotations = useCollection<Quotation>("quotations");
  const printerModels = useCollection<PrinterModel>("printerModels");
  const customerPrinters = useCollection<CustomerPrinter>("customerPrinters");
  const courses = useCollection<Course>("courses");
  const students = useCollection<Student>("students");
  const tickets = useCollection<ServiceTicket>("serviceTickets");
  const tasks = useCollection<Task>("tasks");
  const documents = useCollection<Document>("documents");
  const knowledgeNotes = useCollection<KnowledgeNote>("knowledgeNotes");
  const memoryRecords = useCollection<MemoryRecord>("memoryRecords");

  const all = [
    customers,
    leads,
    organizations,
    quotations,
    printerModels,
    customerPrinters,
    courses,
    students,
    tickets,
    tasks,
    documents,
    knowledgeNotes,
    memoryRecords,
  ];

  // RECORD SCOPE at the SOURCE: an unauthorized row must never become a rankable
  // hit (never "rank everything, then hide on click"). Route scope in the palette
  // already drops hits whose destination the portal can't open; this closes the
  // remaining gap — collections a portal CAN open but whose ROWS are owner-scoped.
  const { portal, scope } = useScopeContext();
  const scopedTickets = scopeRecords("serviceTickets", portal, scope, tickets.data ?? []);
  const scopedTasks = scopeRecords("tasks", portal, scope, tasks.data ?? []);
  // technician customer context is narrowed to the customers on their OWN tickets;
  // manager is broad; student searches no operational customers/roster.
  const allowedCustomerIds = new Set(
    scopedTickets.map((t) => t.customerId).filter((id): id is string => typeof id === "string"),
  );
  const scopedCustomers =
    portal === "manager"
      ? customers.data ?? []
      : portal === "technician"
        ? (customers.data ?? []).filter((c) => allowedCustomerIds.has(c.id))
        : [];
  const scopedStudents = portal === "manager" ? students.data ?? [] : [];

  return {
    isLoading: all.some((q) => q.isLoading),
    data: {
      customers: scopedCustomers,
      leads: portal === "manager" ? leads.data ?? [] : [],
      organizations: portal === "manager" ? organizations.data ?? [] : [],
      quotations: portal === "manager" ? quotations.data ?? [] : [],
      printerModels: printerModels.data ?? [],
      customerPrinters: portal === "manager" ? customerPrinters.data ?? [] : [],
      courses: courses.data ?? [],
      students: scopedStudents,
      tickets: scopedTickets,
      tasks: scopedTasks,
      documents: portal === "manager" ? documents.data ?? [] : [],
      knowledgeNotes: knowledgeNotes.data ?? [],
      memoryRecords: portal === "manager" ? memoryRecords.data ?? [] : [],
    },
  };
}
