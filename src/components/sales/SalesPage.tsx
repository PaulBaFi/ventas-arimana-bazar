import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SubmitEvent,
} from "react";
import type {
  Department,
  District,
  PaymentMethod,
  Product,
  Province,
  Receipt,
  Sale,
  User,
} from "@/domain/models";
import { hasPermission } from "@/domain/permissions";
import { authService } from "@/services/authService";
import {
  customerService,
  type CustomerRecord,
} from "@/services/customerService";
import { catalogService } from "@/services/catalogService";
import { organizationService } from "@/services/organizationService";
import { paymentMethodService } from "@/services/paymentMethodService";
import {
  salesService,
  type SaleDetails,
  type SaleView,
} from "@/services/salesService";
import { localRepository } from "@/persistence/database";
import { ActionButton } from "@/components/ui/ActionButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Check, Eye, FilePlus2, Pencil, Plus, Trash2, X } from "lucide-react";

type Tab = "sales" | "receipts" | "payments";
interface DraftLine {
  productId: string;
  quantity: string;
  unitPrice?: number;
}
interface SaleDraft {
  id?: string;
  customerId: string;
  sellerId: string;
  branchId: string;
  saleDate: string;
  paymentMethodId: string;
  receiptType: "Boleta" | "Factura" | "";
  departmentId: string;
  provinceId: string;
  districtId: string;
  lines: DraftLine[];
}
type ConfirmAction = {
  kind:
    | "confirm-sale"
    | "void-sale"
    | "delete-sale"
    | "void-receipt"
    | "delete-receipt"
    | "delete-payment";
  id: string;
};
const emptySale = (): SaleDraft => ({
  customerId: "",
  sellerId: "",
  branchId: "",
  saleDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16),
  paymentMethodId: "",
  receiptType: "Boleta",
  departmentId: "",
  provinceId: "",
  districtId: "",
  lines: [{ productId: "", quantity: "1" }],
});
const currency = (amount: number) => `S/ ${amount.toFixed(2)}`;
const seriesFor = (type: Receipt["type"]) =>
  type === "Boleta" ? "B001" : "F001";

export function SalesPage({ initialTab = "sales" }: { initialTab?: Tab }) {
  const [actor, setActor] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [sales, setSales] = useState<SaleView[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sellers, setSellers] = useState<
    Awaited<ReturnType<typeof organizationService.listSellers>>
  >([]);
  const [branches, setBranches] = useState<
    Awaited<ReturnType<typeof organizationService.listBranches>>
  >([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [salesSearch, setSalesSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [receiptFilter, setReceiptFilter] = useState("");
  const [saleStateFilter, setSaleStateFilter] = useState<"all" | Sale["state"]>(
    "all",
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [provinceFilter, setProvinceFilter] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptTypeFilter, setReceiptTypeFilter] = useState<
    "all" | Receipt["type"]
  >("all");
  const [receiptStateFilter, setReceiptStateFilter] = useState<
    "all" | Receipt["state"]
  >("all");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStateFilter, setPaymentStateFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [saleForm, setSaleForm] = useState<SaleDraft | null>(null);
  const [paymentForm, setPaymentForm] = useState<{
    id?: string;
    name: string;
    description: string;
  } | null>(null);
  const [receiptForm, setReceiptForm] = useState<{
    saleId: string;
    type: Receipt["type"];
    series: string;
    id?: string;
  } | null>(null);
  const [receiptSaleId, setReceiptSaleId] = useState("");
  const [saleDetails, setSaleDetails] = useState<SaleDetails | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null,
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const canWriteSales = hasPermission(actor?.role, "sales:write");
  const canWritePayments = hasPermission(actor?.role, "payments:write");
  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.status === "active"),
    [branches],
  );
  const activeSellers = useMemo(
    () =>
      sellers.filter(
        (seller) =>
          seller.status === "active" &&
          activeBranches.some((branch) => branch.id === seller.branchId),
      ),
    [sellers, activeBranches],
  );
  const visiblePayments = useMemo(
    () =>
      methods.filter(
        (method) =>
          (paymentStateFilter === "all" ||
            method.status === paymentStateFilter) &&
          (!paymentSearch.trim() ||
            `${method.name} ${method.description ?? ""}`
              .toLocaleLowerCase("es")
              .includes(paymentSearch.trim().toLocaleLowerCase("es"))),
      ),
    [methods, paymentSearch, paymentStateFilter],
  );

  const reload = useCallback(async () => {
    const current = await authService.currentUser();
    if (!current) {
      window.location.replace("/login/");
      return;
    }
    setActor(current);
    const [
      customerRows,
      productRows,
      sellerRows,
      branchRows,
      paymentRows,
      departmentRows,
      provinceRows,
      districtRows,
      saleRows,
      receiptRows,
    ] = await Promise.all([
      customerService.list(current.role),
      catalogService.listProducts(current.role),
      organizationService.listSellers(current.role),
      organizationService.listBranches(current.role),
      paymentMethodService.list(current.role),
      localRepository.list("departments"),
      localRepository.list("provinces"),
      localRepository.list("districts"),
      salesService.search(current.role, {
        query: salesSearch,
        state: saleStateFilter,
        from: from || undefined,
        to: to || undefined,
        customerId: customerFilter || undefined,
        departmentId: departmentFilter || undefined,
        provinceId: provinceFilter || undefined,
        districtId: districtFilter || undefined,
      }),
      salesService.searchReceipts(
        current.role,
        receiptSearch,
        receiptTypeFilter,
        receiptStateFilter,
      ),
    ]);
    setCustomers(customerRows);
    setProducts(productRows);
    setSellers(sellerRows);
    setBranches(branchRows);
    setMethods(paymentRows);
    setDepartments(departmentRows);
    setProvinces(provinceRows);
    setDistricts(districtRows);
    setSales(saleRows);
    setReceipts(receiptRows);
  }, [
    salesSearch,
    saleStateFilter,
    from,
    to,
    customerFilter,
    departmentFilter,
    provinceFilter,
    districtFilter,
    receiptSearch,
    receiptTypeFilter,
    receiptStateFilter,
  ]);
  useEffect(() => {
    void reload().catch((error) =>
      setMessage({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las operaciones.",
      }),
    );
  }, [reload]);

  const filteredSales = useMemo(
    () =>
      sales.filter(
        (row) =>
          (!customerFilter || row.sale.customerId === customerFilter) &&
          (!receiptFilter.trim() ||
            `${row.receipt?.type ?? ""} ${row.receipt?.series ?? ""} ${row.receipt?.number ?? ""}`
              .toLocaleLowerCase("es")
              .includes(receiptFilter.trim().toLocaleLowerCase("es"))),
      ),
    [sales, customerFilter, receiptFilter],
  );
  const salesColumns = useMemo<DataColumn<SaleView>[]>(
    () => [
      {
        key: "number",
        header: "Venta",
        value: (row) => (
          <div>
            <p className="font-bold">{row.sale.saleNumber}</p>
            <p className="text-xs text-text-secondary">
              {new Date(row.sale.saleDate).toLocaleString("es-PE")}
            </p>
          </div>
        ),
        searchable: (row) => `${row.sale.saleNumber} ${row.sale.saleDate}`,
      },
      {
        key: "customer",
        header: "Cliente",
        value: (row) => (
          <div>
            <p className="font-semibold">{row.customerName}</p>
            <p className="text-xs text-text-secondary">
              {row.customerDocument}
            </p>
          </div>
        ),
        searchable: (row) => `${row.customerName} ${row.customerDocument}`,
      },
      {
        key: "receipt",
        header: "Comprobante",
        value: (row) =>
          row.receipt ? (
            `${row.receipt.type} ${row.receipt.series}-${row.receipt.number}`
          ) : (
            <span className="text-text-muted">Pendiente</span>
          ),
        searchable: (row) =>
          `${row.receipt?.type ?? ""} ${row.receipt?.series ?? ""} ${row.receipt?.number ?? ""}`,
      },
      {
        key: "seller",
        header: "Vendedor / Sucursal",
        value: (row) => (
          <div>
            <p>{row.sellerName}</p>
            <p className="text-xs text-text-secondary">{row.branchName}</p>
          </div>
        ),
        searchable: (row) => `${row.sellerName} ${row.branchName}`,
      },
      {
        key: "total",
        header: "Total",
        value: (row) => (
          <span className="font-bold">{currency(row.sale.total)}</span>
        ),
      },
      {
        key: "state",
        header: "Estado",
        value: (row) => <StatusBadge status={row.sale.state} />,
      },
      {
        key: "actions",
        header: "Acciones",
        value: (row) => (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-label="Ver venta"
              onClick={() => void openDetails(row.sale.id)}
              className="text-primary-active hover:underline"
            >
              <Eye size={15} />
            </button>
            {canWriteSales && row.sale.state === "draft" && (
              <>
                <button
                  type="button"
                  aria-label="Editar venta"
                  onClick={() => void editSale(row.sale)}
                  className="text-text-secondary hover:underline"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  aria-label="Confirmar venta"
                  onClick={() =>
                    setConfirmAction({ kind: "confirm-sale", id: row.sale.id })
                  }
                  className="text-success hover:underline"
                >
                  <Check size={15} />
                </button>
                <button
                  type="button"
                  aria-label="Eliminar venta"
                  onClick={() =>
                    setConfirmAction({ kind: "delete-sale", id: row.sale.id })
                  }
                  className="text-danger hover:underline"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
            {canWriteSales && row.sale.state === "confirmed" && (
              <button
                type="button"
                aria-label="Anular venta"
                onClick={() =>
                  setConfirmAction({ kind: "void-sale", id: row.sale.id })
                }
                className="text-danger hover:underline"
              >
                <X size={15} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [canWriteSales],
  );
  const receiptColumns = useMemo<DataColumn<Receipt>[]>(
    () => [
      {
        key: "type",
        header: "Tipo",
        value: (receipt) => (
          <span className="font-semibold">{receipt.type}</span>
        ),
        searchable: (receipt) => receipt.type,
      },
      {
        key: "series-number",
        header: "Serie y número",
        value: (receipt) => (
          <span className="font-bold">
            {receipt.number
              ? `${receipt.series}-${receipt.number}`
              : `${receipt.series} · Pendiente de emisión`}
          </span>
        ),
        searchable: (receipt) => `${receipt.series} ${receipt.number}`,
      },
      {
        key: "sale",
        header: "Venta asociada",
        value: (receipt) =>
          sales.find((row) => row.sale.id === receipt.saleId)?.sale
            .saleNumber ?? receipt.saleId,
        searchable: (receipt) =>
          sales.find((row) => row.sale.id === receipt.saleId)?.sale
            .saleNumber ?? receipt.saleId,
      },
      {
        key: "date",
        header: "Fecha",
        value: (receipt) =>
          new Date(receipt.createdAt).toLocaleDateString("es-PE"),
      },
      {
        key: "state",
        header: "Estado",
        value: (receipt) => <StatusBadge status={receipt.state} />,
      },
      {
        key: "actions",
        header: "Acciones",
        value: (receipt) => (
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Ver venta asociada"
              onClick={() => void openDetails(receipt.saleId)}
              className="text-primary-active hover:underline"
            >
              <Eye size={15} />
            </button>
            {canWriteSales && receipt.state === "draft" && (
              <>
                <button
                  type="button"
                  aria-label="Modificar comprobante"
                  onClick={() => openReceiptEdit(receipt)}
                  className="text-text-secondary hover:underline"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  aria-label="Eliminar comprobante"
                  onClick={() =>
                    setConfirmAction({ kind: "delete-receipt", id: receipt.id })
                  }
                  className="text-danger hover:underline"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
            {canWriteSales && receipt.state === "issued" && (
              <button
                type="button"
                aria-label="Anular comprobante"
                onClick={() =>
                  setConfirmAction({ kind: "void-receipt", id: receipt.id })
                }
                className="text-danger hover:underline"
              >
                <X size={15} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [sales, canWriteSales],
  );
  const paymentColumns = useMemo<DataColumn<PaymentMethod>[]>(
    () => [
      {
        key: "name",
        header: "Medio de pago",
        value: (method) => (
          <div>
            <p className="font-semibold">{method.name}</p>
            <p className="text-xs text-text-secondary">
              {method.description || "Sin descripción"}
            </p>
          </div>
        ),
        searchable: (method) => `${method.name} ${method.description ?? ""}`,
      },
      {
        key: "status",
        header: "Estado",
        value: (method) => <StatusBadge status={method.status} />,
      },
      {
        key: "actions",
        header: "Acciones",
        value: (method) => (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setMessage({
                  ok: true,
                  text: `${method.name}${method.description ? ` · ${method.description}` : ""} · ${method.status === "active" ? "Activo" : "Inactivo"}`,
                })
              }
              className="text-xs font-bold text-primary-active hover:underline"
            >
              Ver
            </button>
            {canWritePayments && method.status === "active" && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setPaymentForm({
                      id: method.id,
                      name: method.name,
                      description: method.description ?? "",
                    })
                  }
                  className="text-xs font-bold text-text-secondary hover:underline"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmAction({ kind: "delete-payment", id: method.id })
                  }
                  className="text-xs font-bold text-danger hover:underline"
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        ),
      },
    ],
    [canWritePayments],
  );

  async function editSale(sale: Sale) {
    const details = await salesService.details(actor!.role, sale.id);
    setSaleForm({
      id: sale.id,
      customerId: sale.customerId,
      sellerId: sale.sellerId,
      branchId: sale.branchId,
      saleDate: new Date(
        new Date(sale.saleDate).getTime() -
          new Date(sale.saleDate).getTimezoneOffset() * 60_000,
      )
        .toISOString()
        .slice(0, 16),
      paymentMethodId: sale.paymentMethodId ?? "",
      receiptType: details.receipt?.type ?? "",
      departmentId: sale.departmentId ?? "",
      provinceId: sale.provinceId ?? "",
      districtId: sale.districtId ?? "",
      lines: sale.lines.map((line) => ({
        productId: line.productId,
        quantity: String(line.quantity),
        unitPrice: line.unitPrice,
      })),
    });
  }
  async function openDetails(id: string) {
    try {
      setSaleDetails(await salesService.details(actor!.role, id));
    } catch (error) {
      setMessage({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "No se pudo consultar la operación.",
      });
    }
  }
  function openReceiptEdit(receipt: Receipt) {
    setReceiptForm({
      id: receipt.id,
      saleId: receipt.saleId,
      type: receipt.type,
      series: receipt.series,
    });
  }
  function closeSaleForm() {
    setSaleForm(null);
  }
  async function saveSale(confirmAfterSave: boolean) {
    if (!actor || !saleForm) return;
    setBusy(true);
    setMessage(null);
    try {
      const input = {
        ...saleForm,
        paymentMethodId: saleForm.paymentMethodId || undefined,
        receiptType: saleForm.receiptType || undefined,
        departmentId: saleForm.departmentId || undefined,
        provinceId: saleForm.provinceId || undefined,
        districtId: saleForm.districtId || undefined,
        lines: saleForm.lines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
        })),
      };
      const saved = await salesService.saveDraft(actor.role, actor, input);
      if (confirmAfterSave)
        await salesService.confirm(actor.role, actor, saved.id);
      setSaleForm(null);
      setMessage({
        ok: true,
        text: confirmAfterSave
          ? `La venta ${saved.saleNumber} fue confirmada.`
          : `El borrador ${saved.saleNumber} fue guardado.`,
      });
      await reload();
    } catch (error) {
      setMessage({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "No se pudo guardar la venta.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function savePayment(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actor || !paymentForm) return;
    setBusy(true);
    setPaymentError("");
    try {
      await paymentMethodService.save(actor.role, paymentForm);
      setPaymentForm(null);
      setMessage({
        ok: true,
        text: paymentForm.id
          ? "Medio de pago actualizado."
          : "Medio de pago creado.",
      });
      await reload();
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el medio de pago.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveReceipt(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actor || !receiptForm) return;
    setBusy(true);
    setReceiptError("");
    try {
      await salesService.saveReceiptDraft(
        actor.role,
        actor,
        receiptForm.saleId,
        receiptForm.type,
        receiptForm.series,
      );
      setReceiptForm(null);
      setReceiptSaleId("");
      setMessage({ ok: true, text: "Comprobante borrador guardado." });
      await reload();
    } catch (error) {
      setReceiptError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el comprobante.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function runConfirmedAction() {
    if (!actor || !confirmAction) return;
    setBusy(true);
    try {
      const action = confirmAction;
      if (action.kind === "confirm-sale") {
        const sale = await salesService.confirm(actor.role, actor, action.id);
        setMessage({
          ok: true,
          text: `La venta ${sale.saleNumber} fue confirmada.`,
        });
      }
      if (action.kind === "void-sale") {
        await salesService.voidSale(actor.role, actor, action.id);
        setMessage({
          ok: true,
          text: "La venta fue anulada; se conserva su historial.",
        });
      }
      if (action.kind === "delete-sale") {
        await salesService.deleteDraft(actor.role, actor, action.id);
        setMessage({ ok: true, text: "El borrador fue eliminado." });
      }
      if (action.kind === "void-receipt") {
        await salesService.voidReceipt(actor.role, actor, action.id);
        setMessage({
          ok: true,
          text: "El comprobante fue anulado; se conserva su numeración.",
        });
      }
      if (action.kind === "delete-receipt") {
        await salesService.deleteReceipt(actor.role, actor, action.id);
        setMessage({
          ok: true,
          text: "El comprobante borrador fue eliminado.",
        });
      }
      if (action.kind === "delete-payment") {
        const result = await paymentMethodService.delete(actor.role, action.id);
        setMessage({
          ok: true,
          text:
            result === "deactivated"
              ? "Medio de pago desactivado; las operaciones históricas se conservan."
              : "Medio de pago eliminado.",
        });
      }
      setConfirmAction(null);
      await reload();
    } catch (error) {
      setConfirmAction(null);
      setMessage({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "No se pudo completar la operación.",
      });
    } finally {
      setBusy(false);
    }
  }
  const locationName = (sale: Sale) =>
    [
      departments.find((item) => item.id === sale.departmentId)?.name,
      provinces.find((item) => item.id === sale.provinceId)?.name,
      districts.find((item) => item.id === sale.districtId)?.name,
    ]
      .filter(Boolean)
      .join(" / ");
  const draftSalesWithoutReceipt = sales.filter(
    (row) => row.sale.state === "draft" && !row.receipt,
  );
  const formSubtotal = (saleForm?.lines ?? []).reduce((sum, line) => {
    const product = products.find((item) => item.id === line.productId);
    return (
      sum +
      (line.unitPrice ?? product?.unitPrice ?? 0) * Number(line.quantity || 0)
    );
  }, 0);
  const receiptConfirmCopy: Record<
    ConfirmAction["kind"],
    { title: string; message: string }
  > = {
    "confirm-sale": {
      title: "Confirmar venta",
      message:
        "¿Confirmar esta venta? Se validarán las relaciones y se emitirá el comprobante asociado.",
    },
    "void-sale": {
      title: "Anular venta",
      message:
        "¿Anular la venta confirmada? La venta y el comprobante se conservarán con estado anulado.",
    },
    "delete-sale": {
      title: "Eliminar borrador",
      message:
        "¿Eliminar este borrador y su comprobante borrador? La operación aún no ha sido confirmada.",
    },
    "void-receipt": {
      title: "Anular comprobante",
      message:
        "¿Anular este comprobante emitido? La numeración y la trazabilidad se conservarán.",
    },
    "delete-receipt": {
      title: "Eliminar comprobante borrador",
      message:
        "¿Eliminar este comprobante mientras la venta permanece en borrador?",
    },
    "delete-payment": {
      title: "Eliminar medio de pago",
      message:
        "¿Eliminar este medio de pago? Si tiene operaciones relacionadas, se desactivará y se conservará el historial.",
    },
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-primary-active">
            Operación comercial
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">
            Ventas y comprobantes
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Registro transaccional, comprobantes y medios de pago.
          </p>
        </div>
        {canWriteSales && tab === "sales" && (
          <ActionButton icon={Plus} onClick={() => setSaleForm(emptySale())}>
            Registrar venta
          </ActionButton>
        )}
        {canWritePayments && tab === "payments" && (
          <ActionButton
            icon={Plus}
            onClick={() => setPaymentForm({ name: "", description: "" })}
          >
            Crear medio de pago
          </ActionButton>
        )}
        {canWriteSales && tab === "receipts" && (
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Venta borrador para comprobante"
              value={receiptSaleId}
              onChange={(event) => setReceiptSaleId(event.target.value)}
              className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm"
            >
              <option value="">Seleccionar venta borrador</option>
              {draftSalesWithoutReceipt.map((row) => (
                <option key={row.sale.id} value={row.sale.id}>
                  {row.sale.saleNumber} · {row.customerName}
                </option>
              ))}
            </select>
            <ActionButton
              icon={FilePlus2}
              disabled={!receiptSaleId}
              onClick={() =>
                setReceiptForm({
                  saleId: receiptSaleId,
                  type: "Boleta",
                  series: "B001",
                })
              }
            >
              Crear comprobante
            </ActionButton>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border-default">
        {(["sales", "receipts", "payments"] as const).map((value) => (
          <button
            type="button"
            key={value}
            onClick={() => {
              setTab(value);
              setMessage(null);
            }}
            className={`border-b-2 px-4 py-3 text-sm font-bold ${tab === value ? "border-primary text-primary-active" : "border-transparent text-text-secondary hover:text-text-primary"}`}
          >
            {value === "sales"
              ? "Ventas"
              : value === "receipts"
                ? "Comprobantes"
                : "Medios de pago"}
          </button>
        ))}
      </div>
      {message && (
        <div
          role="status"
          className={`flex justify-between rounded-lg p-3 text-sm ${message.ok ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}
        >
          {message.text}
          <button
            type="button"
            aria-label="Cerrar mensaje"
            onClick={() => setMessage(null)}
          >
            ×
          </button>
        </div>
      )}

      {tab === "sales" && (
        <>
          <div className="grid gap-3 rounded-xl border border-border-default bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Buscar venta, cliente o comprobante
              <input
                type="search"
                value={salesSearch}
                onChange={(event) => setSalesSearch(event.target.value)}
                placeholder="N.º de venta, documento, serie…"
                className="min-h-10 rounded-lg border border-border-default px-3 text-sm font-normal text-text-primary"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Cliente
              <select
                value={customerFilter}
                onChange={(event) => setCustomerFilter(event.target.value)}
                className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal"
              >
                <option value="">Todos los clientes</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Comprobante
              <input
                type="search"
                value={receiptFilter}
                onChange={(event) => setReceiptFilter(event.target.value)}
                placeholder="Tipo, serie o número"
                className="min-h-10 rounded-lg border border-border-default px-3 text-sm font-normal text-text-primary"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Estado
              <select
                value={saleStateFilter}
                onChange={(event) =>
                  setSaleStateFilter(
                    event.target.value as typeof saleStateFilter,
                  )
                }
                className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal"
              >
                <option value="all">Todos</option>
                <option value="draft">Borrador</option>
                <option value="confirmed">Confirmada</option>
                <option value="voided">Anulada</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Desde
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="min-h-10 rounded-lg border border-border-default px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Hasta
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="min-h-10 rounded-lg border border-border-default px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Departamento
              <select
                value={departmentFilter}
                onChange={(event) => {
                  setDepartmentFilter(event.target.value);
                  setProvinceFilter("");
                  setDistrictFilter("");
                }}
                className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal"
              >
                <option value="">Todos</option>
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Provincia
              <select
                value={provinceFilter}
                onChange={(event) => {
                  setProvinceFilter(event.target.value);
                  setDistrictFilter("");
                }}
                disabled={!departmentFilter}
                className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal disabled:bg-surface-page"
              >
                <option value="">Todas</option>
                {provinces
                  .filter((item) => item.departmentId === departmentFilter)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Distrito
              <select
                value={districtFilter}
                onChange={(event) => setDistrictFilter(event.target.value)}
                disabled={!provinceFilter}
                className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal disabled:bg-surface-page"
              >
                <option value="">Todos</option>
                {districts
                  .filter((item) => item.provinceId === provinceFilter)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setSalesSearch("");
                setCustomerFilter("");
                setReceiptFilter("");
                setSaleStateFilter("all");
                setFrom("");
                setTo("");
                setDepartmentFilter("");
                setProvinceFilter("");
                setDistrictFilter("");
              }}
              className="self-end text-sm font-bold text-primary-active hover:underline px-3 py-2.5 rounded-lg border border-border-default"
            >
              Limpiar filtros
            </button>
          </div>

          <DataTable
            rows={filteredSales}
            columns={salesColumns}
            rowKey={(row) => row.sale.id}
            emptyMessage="No se encontraron ventas con los filtros seleccionados."
          />
        </>
      )}

      {tab === "receipts" && (
        <>
          <div className="grid gap-3 rounded-xl border border-border-default bg-white p-4 sm:grid-cols-3">
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Buscar por serie, número o venta
              <input
                type="search"
                value={receiptSearch}
                onChange={(event) => setReceiptSearch(event.target.value)}
                placeholder="B001-000001"
                className="min-h-10 rounded-lg border border-border-default px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Tipo
              <select
                value={receiptTypeFilter}
                onChange={(event) =>
                  setReceiptTypeFilter(
                    event.target.value as typeof receiptTypeFilter,
                  )
                }
                className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal"
              >
                <option value="all">Todos</option>
                <option>Boleta</option>
                <option>Factura</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Estado
              <select
                value={receiptStateFilter}
                onChange={(event) =>
                  setReceiptStateFilter(
                    event.target.value as typeof receiptStateFilter,
                  )
                }
                className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal"
              >
                <option value="all">Todos</option>
                <option value="draft">Borrador</option>
                <option value="issued">Emitido</option>
                <option value="voided">Anulado</option>
              </select>
            </label>
          </div>
          <DataTable
            rows={receipts}
            columns={receiptColumns}
            rowKey={(item) => item.id}
            emptyMessage="No hay comprobantes que coincidan con los filtros."
          />
          <p className="text-xs text-text-secondary">
            Los comprobantes se registran internamente; no se realiza emisión
            tributaria ni conexión con SUNAT.
          </p>
        </>
      )}

      {tab === "payments" && (
        <>
          <div className="grid gap-3 rounded-xl border border-border-default bg-white p-4 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Buscar medio de pago
              <input
                type="search"
                value={paymentSearch}
                onChange={(event) => setPaymentSearch(event.target.value)}
                placeholder="Nombre o descripción"
                className="min-h-10 rounded-lg border border-border-default px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-text-secondary">
              Estado
              <select
                value={paymentStateFilter}
                onChange={(event) =>
                  setPaymentStateFilter(
                    event.target.value as typeof paymentStateFilter,
                  )
                }
                className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal"
              >
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </label>
          </div>
          <DataTable
            rows={visiblePayments}
            columns={paymentColumns}
            rowKey={(item) => item.id}
            emptyMessage="No hay medios de pago con esos filtros."
          />
        </>
      )}

      {saleForm && (
        <div
          className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/45 p-3 sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSaleForm();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-form-title"
            className="my-auto w-full max-w-5xl rounded-2xl bg-white p-5 shadow-modal sm:p-7"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-primary-active">
                  Registro de Ventas
                </p>
                <h2
                  id="sale-form-title"
                  className="mt-1 text-2xl font-extrabold"
                >
                  {saleForm.id ? "Modificar borrador" : "Nueva venta"}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Los importes se fijan en el detalle al guardar la venta.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={closeSaleForm}
                className="text-xl text-text-secondary"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveSale(false);
              }}
              className="mt-5 space-y-5"
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label="Cliente" name="saleCustomer" required>
                  <select
                    id="saleCustomer"
                    required
                    value={saleForm.customerId}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        customerId: event.target.value,
                      })
                    }
                    className="min-h-10 w-full rounded-lg border border-border-default bg-white px-3 text-sm"
                  >
                    <option value="">Seleccionar cliente</option>
                    {customers
                      .filter((item) => item.status === "active")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.displayName} · {item.documentType}{" "}
                          {item.documentNumber}
                        </option>
                      ))}
                  </select>
                </FormField>
                <FormField label="Vendedor" name="saleSeller" required>
                  <select
                    id="saleSeller"
                    required
                    value={saleForm.sellerId}
                    onChange={(event) => {
                      const seller = activeSellers.find(
                        (item) => item.id === event.target.value,
                      );
                      setSaleForm({
                        ...saleForm,
                        sellerId: event.target.value,
                        branchId: seller?.branchId ?? "",
                      });
                    }}
                    className="min-h-10 w-full rounded-lg border border-border-default bg-white px-3 text-sm"
                  >
                    <option value="">Seleccionar vendedor</option>
                    {activeSellers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Sucursal" name="saleBranch" required>
                  <select
                    id="saleBranch"
                    required
                    value={saleForm.branchId}
                    onChange={(event) =>
                      setSaleForm({ ...saleForm, branchId: event.target.value })
                    }
                    className="min-h-10 w-full rounded-lg border border-border-default bg-white px-3 text-sm"
                  >
                    <option value="">Seleccionar sucursal</option>
                    {activeBranches
                      .filter(
                        (branch) =>
                          !saleForm.sellerId || branch.id === saleForm.branchId,
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} · {item.name}
                        </option>
                      ))}
                  </select>
                </FormField>
                <FormField
                  label="Fecha y hora"
                  name="saleDate"
                  type="datetime-local"
                  required
                  value={saleForm.saleDate}
                  onChange={(event) =>
                    setSaleForm({ ...saleForm, saleDate: event.target.value })
                  }
                />
              </div>

              <section className="rounded-xl border border-border-default p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold">Detalle de productos</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSaleForm({
                        ...saleForm,
                        lines: [
                          ...saleForm.lines,
                          { productId: "", quantity: "1" },
                        ],
                      })
                    }
                    className="text-sm font-bold text-primary-active hover:underline"
                  >
                    ＋ Agregar producto
                  </button>
                </div>

                <div className="space-y-3">
                  {saleForm.lines.map((line, index) => {
                    const product = products.find(
                      (item) => item.id === line.productId,
                    );
                    const price = line.unitPrice ?? product?.unitPrice;
                    return (
                      <div
                        key={index}
                        className="grid gap-3 rounded-lg bg-surface-page p-3 sm:grid-cols-[1fr_7rem_7rem_7rem_auto] sm:items-end"
                      >
                        <label className="grid gap-1 text-xs font-bold text-text-secondary">
                          Producto
                          <select
                            required
                            value={line.productId}
                            onChange={(event) => {
                              const selected = products.find(
                                (item) => item.id === event.target.value,
                              );
                              setSaleForm({
                                ...saleForm,
                                lines: saleForm.lines.map((item, row) =>
                                  row === index
                                    ? {
                                        ...item,
                                        productId: event.target.value,
                                        unitPrice: selected?.unitPrice,
                                      }
                                    : item,
                                ),
                              });
                            }}
                            className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal text-text-primary"
                          >
                            <option value="">Seleccionar producto</option>
                            {products
                              .filter((item) => item.status === "active")
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.code} · {item.name} ·{" "}
                                  {currency(item.unitPrice)}
                                </option>
                              ))}
                          </select>
                        </label>

                        <label className="grid gap-1 text-xs font-bold text-text-secondary">
                          Cantidad
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={line.quantity}
                            onChange={(event) =>
                              setSaleForm({
                                ...saleForm,
                                lines: saleForm.lines.map((item, row) =>
                                  row === index
                                    ? { ...item, quantity: event.target.value }
                                    : item,
                                ),
                              })
                            }
                            className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal text-text-primary"
                          />
                        </label>

                        <div className="grid gap-1 text-xs font-bold text-text-secondary">
                          <span>Precio unit.</span>
                          <div className="flex min-h-10 items-center text-sm font-semibold text-text-primary">
                            {price !== undefined ? currency(price) : "—"}
                          </div>
                        </div>

                        <div className="grid gap-1 text-xs font-bold text-text-secondary">
                          <span>Subtotal</span>
                          <div className="flex min-h-10 items-center text-sm font-bold text-text-primary">
                            {price !== undefined
                              ? currency(price * Number(line.quantity || 0))
                              : "—"}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={saleForm.lines.length === 1}
                          onClick={() =>
                            setSaleForm({
                              ...saleForm,
                              lines: saleForm.lines.filter(
                                (_, row) => row !== index,
                              ),
                            })
                          }
                          className="min-h-10 rounded-lg px-3 py-2 text-sm font-bold text-danger disabled:opacity-40"
                        >
                          Quitar
                        </button>
                      </div>
                    );
                  })}
                </div>

                <p className="mt-4 text-right text-lg font-extrabold">
                  Total: {currency(formSubtotal)}
                </p>
              </section>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label="Medio de pago" name="paymentMethodId">
                  <select
                    id="paymentMethodId"
                    value={saleForm.paymentMethodId}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        paymentMethodId: event.target.value,
                      })
                    }
                    className="min-h-10 w-full rounded-lg border border-border-default bg-white px-3 text-sm"
                  >
                    <option value="">Seleccionar antes de confirmar</option>
                    {methods
                      .filter((item) => item.status === "active")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </FormField>
                <FormField label="Comprobante" name="receiptType">
                  <select
                    id="receiptType"
                    value={saleForm.receiptType}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        receiptType: event.target
                          .value as SaleDraft["receiptType"],
                      })
                    }
                    className="min-h-10 w-full rounded-lg border border-border-default bg-white px-3 text-sm"
                  >
                    <option value="">Pendiente</option>
                    <option value="Boleta">
                      Boleta · serie {seriesFor("Boleta")}
                    </option>
                    <option value="Factura">
                      Factura · serie {seriesFor("Factura")}
                    </option>
                  </select>
                </FormField>
                <FormField label="Departamento" name="departmentId">
                  <select
                    id="departmentId"
                    value={saleForm.departmentId}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        departmentId: event.target.value,
                        provinceId: "",
                        districtId: "",
                      })
                    }
                    className="min-h-10 w-full rounded-lg border border-border-default bg-white px-3 text-sm"
                  >
                    <option value="">Sin ubicación</option>
                    {departments
                      .filter((item) => item.status === "active")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </FormField>
                <FormField label="Provincia" name="provinceId">
                  <select
                    id="provinceId"
                    disabled={!saleForm.departmentId}
                    value={saleForm.provinceId}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        provinceId: event.target.value,
                        districtId: "",
                      })
                    }
                    className="min-h-10 w-full rounded-lg border border-border-default bg-white px-3 text-sm disabled:bg-surface-page"
                  >
                    <option value="">Seleccionar</option>
                    {provinces
                      .filter(
                        (item) =>
                          item.departmentId === saleForm.departmentId &&
                          item.status === "active",
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </FormField>
                <FormField label="Distrito" name="districtId">
                  <select
                    id="districtId"
                    disabled={!saleForm.provinceId}
                    value={saleForm.districtId}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        districtId: event.target.value,
                      })
                    }
                    className="min-h-10 w-full rounded-lg border border-border-default bg-white px-3 text-sm disabled:bg-surface-page"
                  >
                    <option value="">Seleccionar</option>
                    {districts
                      .filter(
                        (item) =>
                          item.provinceId === saleForm.provinceId &&
                          item.status === "active",
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </FormField>
              </div>

              <div className="flex flex-col-reverse justify-end gap-3 border-t border-border-default pt-4 sm:flex-row">
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={closeSaleForm}
                >
                  Cancelar
                </ActionButton>
                <ActionButton type="submit" variant="secondary" disabled={busy}>
                  {busy ? "Guardando…" : "Guardar borrador"}
                </ActionButton>
                <ActionButton
                  type="button"
                  disabled={busy}
                  onClick={() => void saveSale(true)}
                >
                  {busy ? "Procesando…" : "Guardar y confirmar"}
                </ActionButton>
              </div>
            </form>
          </section>
        </div>
      )}

      {paymentForm && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-950/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPaymentForm(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-form-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-modal"
          >
            <h2 id="payment-form-title" className="text-xl font-bold">
              {paymentForm.id
                ? "Modificar medio de pago"
                : "Crear medio de pago"}
            </h2>
            <form onSubmit={savePayment} className="mt-5 grid gap-4">
              <FormField
                label="Nombre"
                name="paymentName"
                required
                value={paymentForm.name}
                onChange={(event) =>
                  setPaymentForm({ ...paymentForm, name: event.target.value })
                }
                error={paymentError}
              />
              <FormField
                label="Descripción"
                name="paymentDescription"
                value={paymentForm.description}
                onChange={(event) =>
                  setPaymentForm({
                    ...paymentForm,
                    description: event.target.value,
                  })
                }
              />
              <div className="flex justify-end gap-3">
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => setPaymentForm(null)}
                >
                  Cancelar
                </ActionButton>
                <ActionButton type="submit" disabled={busy}>
                  Guardar
                </ActionButton>
              </div>
            </form>
          </section>
        </div>
      )}

      {receiptForm && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-950/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReceiptForm(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-form-title"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-modal"
          >
            <h2 id="receipt-form-title" className="text-xl font-bold">
              {receiptForm.id
                ? "Modificar comprobante borrador"
                : "Crear comprobante"}
            </h2>
            <form onSubmit={saveReceipt} className="mt-5 grid gap-4">
              <FormField
                label="Tipo de comprobante"
                name="receiptTypeEdit"
                required
              >
                <select
                  id="receiptTypeEdit"
                  value={receiptForm.type}
                  onChange={(event) => {
                    const type = event.target.value as Receipt["type"];
                    setReceiptForm({
                      ...receiptForm,
                      type,
                      series: seriesFor(type),
                    });
                    setReceiptError("");
                  }}
                  className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm"
                >
                  <option>Boleta</option>
                  <option>Factura</option>
                </select>
              </FormField>
              <FormField
                label="Serie"
                name="receiptSeries"
                required
                value={receiptForm.series}
                onChange={(event) =>
                  setReceiptForm({
                    ...receiptForm,
                    series: event.target.value.toUpperCase(),
                  })
                }
                hint={`Serie asignada para ${receiptForm.type}: ${seriesFor(receiptForm.type)}`}
                error={receiptError}
              />
              <p className="text-xs text-text-secondary">
                La numeración se asigna automáticamente. No se realizan
                operaciones tributarias externas.
              </p>
              <div className="flex justify-end gap-3">
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => setReceiptForm(null)}
                >
                  Cancelar
                </ActionButton>
                <ActionButton type="submit" disabled={busy}>
                  Guardar comprobante
                </ActionButton>
              </div>
            </form>
          </section>
        </div>
      )}

      {saleDetails && (
        <div
          className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/45 p-3 sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSaleDetails(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-detail-title"
            className="my-auto w-full max-w-3xl rounded-2xl bg-white p-5 shadow-modal sm:p-7"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary-active">
                  Detalle de operación
                </p>
                <h2
                  id="sale-detail-title"
                  className="mt-1 text-2xl font-extrabold"
                >
                  Venta {saleDetails.sale.saleNumber}
                </h2>
              </div>
              <StatusBadge status={saleDetails.sale.state} />
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-text-secondary">Cliente</dt>
                <dd className="font-semibold">
                  {saleDetails.customerName} · {saleDetails.customerDocument}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Fecha</dt>
                <dd>
                  {new Date(saleDetails.sale.saleDate).toLocaleString("es-PE")}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Vendedor / sucursal</dt>
                <dd>
                  {saleDetails.sellerName} · {saleDetails.branchName}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Ubicación de compra</dt>
                <dd>{locationName(saleDetails.sale) || "No especificada"}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Medio de pago</dt>
                <dd>{saleDetails.payment?.name ?? "Pendiente"}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Comprobante</dt>
                <dd>
                  {saleDetails.receipt
                    ? `${saleDetails.receipt.type} ${saleDetails.receipt.series}${saleDetails.receipt.number ? `-${saleDetails.receipt.number}` : " · Pendiente de emisión"} · ${saleDetails.receipt.state}`
                    : "Pendiente"}
                </dd>
              </div>
            </dl>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-page text-xs text-text-secondary">
                  <tr>
                    <th className="p-3">Código / producto</th>
                    <th className="p-3">Cantidad</th>
                    <th className="p-3">Precio</th>
                    <th className="p-3">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {saleDetails.sale.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="p-3">
                        {line.productCode} · {line.productName}
                      </td>
                      <td className="p-3">{line.quantity}</td>
                      <td className="p-3">{currency(line.unitPrice)}</td>
                      <td className="p-3 font-semibold">
                        {currency(line.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="p-3 text-right font-bold">
                      Total
                    </td>
                    <td className="p-3 text-lg font-extrabold">
                      {currency(saleDetails.sale.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <section className="mt-5 rounded-lg bg-surface-page p-4">
              <h3 className="font-bold">Trazabilidad</h3>
              {saleDetails.audit.length ? (
                <ol className="mt-2 space-y-2">
                  {saleDetails.audit.map((entry) => (
                    <li key={entry.id} className="text-xs">
                      <span className="font-semibold">{entry.message}</span>
                      <span className="ml-2 text-text-secondary">
                        {new Date(entry.createdAt).toLocaleString("es-PE")}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-1 text-sm text-text-secondary">
                  Sin modificaciones registradas.
                </p>
              )}
            </section>
            <div className="mt-5 flex justify-end">
              <ActionButton
                variant="secondary"
                onClick={() => setSaleDetails(null)}
              >
                Cerrar
              </ActionButton>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={
          confirmAction
            ? receiptConfirmCopy[confirmAction.kind].title
            : "Confirmar operación"
        }
        message={
          confirmAction ? receiptConfirmCopy[confirmAction.kind].message : ""
        }
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => void runConfirmedAction()}
      />
    </div>
  );
}
