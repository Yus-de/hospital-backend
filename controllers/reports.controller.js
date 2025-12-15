const prisma = require("../prisma/client");
const { sendError } = require("../utils/response");

const getFinancialReport = async (req, res) => {
  try {
    // --- Summary Data ---
    const totalRevenueResult = await prisma.payment.aggregate({
      _sum: {
        amount: true,
      },
    });
    const totalRevenue = totalRevenueResult._sum.amount || 0;

    // For simplicity, let's assume expenses are not detailed in the DB yet, or use a placeholder
    // In a real application, you would query an 'expenses' table.
    const totalExpenses = 12200; // Placeholder

    const netProfit = totalRevenue - totalExpenses;

    const pendingPaymentsResult = await prisma.invoice.aggregate({
      where: {
        isPaid: false,
      },
      _sum: {
        totalAmount: true,
      },
    });
    const pendingPayments = pendingPaymentsResult._sum.totalAmount || 0;

    // --- Revenue Chart Data ---
    const payments = await prisma.payment.findMany({
      select: {
        amount: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const dailyRevenue = {};
    payments.forEach(payment => {
      const date = payment.createdAt.toISOString().split('T')[0];
      dailyRevenue[date] = (dailyRevenue[date] || 0) + payment.amount;
    });

    // Generate a simple dummy expense for each day where there's revenue
    const revenueChart = Object.keys(dailyRevenue).map(date => {
      const revenue = dailyRevenue[date];
      const expenses = Math.floor(revenue * (Math.random() * 0.3 + 0.2)); // 20-50% of revenue as dummy expenses
      return { name: date, revenue, expenses };
    });

    // --- Income Sources Data ---
    const invoiceItems = await prisma.invoiceItem.findMany({
      select: {
        description: true,
        amount: true,
      },
    });

    const incomeSourcesMap = {};
    invoiceItems.forEach(item => {
      incomeSourcesMap[item.description] = (incomeSourcesMap[item.description] || 0) + item.amount;
    });

    const colors = ["#2563eb", "#059669", "#d97706", "#be185d", "#1e40af", "#166534", "#b45309", "#831843"];
    let colorIndex = 0;
    const incomeSources = Object.keys(incomeSourcesMap).map(description => {
      const value = incomeSourcesMap[description];
      const color = colors[colorIndex % colors.length];
      colorIndex++;
      return { name: description, value, color };
    });

    res.json({
      summary: {
        totalRevenue,
        totalExpenses,
        netProfit,
        pendingPayments,
      },
      revenueChart,
      incomeSources,
    });
  } catch (e) {
    console.error("[getFinancialReport] Error:", e);
    return sendError(res, 500, "Failed to generate financial report", e);
  }
};

module.exports = {
  getFinancialReport,
};
