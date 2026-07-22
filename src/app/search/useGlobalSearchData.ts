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

  return {
    isLoading: all.some((q) => q.isLoading),
    data: {
      customers: customers.data ?? [],
      leads: leads.data ?? [],
      organizations: organizations.data ?? [],
      quotations: quotations.data ?? [],
      printerModels: printerModels.data ?? [],
      customerPrinters: customerPrinters.data ?? [],
      courses: courses.data ?? [],
      students: students.data ?? [],
      tickets: tickets.data ?? [],
      tasks: tasks.data ?? [],
      documents: documents.data ?? [],
      knowledgeNotes: knowledgeNotes.data ?? [],
      memoryRecords: memoryRecords.data ?? [],
    },
  };
}
