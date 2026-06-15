// ============================================================
// Spacio AM — Contabilidad · archivo histórico 2023–2025 (PDFs)
// ------------------------------------------------------------
// Los estados de cuenta de 2023–2025 viven en Drive en dos pistas:
//   • "Cuentas Operativas"      → cuentas Operativa GTQ (…6466) y USD (…6508)
//   • "Diseño de interiores"    → cuentas Proyectos GTQ (…6474) y USD (…6482)
// cada una con carpetas Año → Mes que contienen los 2 PDFs del mes.
//
// En vez de fijar ~140 IDs de archivo (frágil), enlazamos a la
// CARPETA del mes: el contador la abre y descarga los PDFs. Robusto
// y fácil de mantener.
//
// Para añadir un mes: pega el ID de su carpeta de Drive en OP/PR.
// ============================================================
(function () {
  "use strict";

  // ym -> id de carpeta de Drive (Cuentas Operativas: …6466 + …6508)
  const OP = {
    "2023-11": "1PHS0exeb-RvNXS_tlmElwOOZQJN8-UyS",
    "2023-12": "1spDQ7oSJqlO7Z2B9c08Veku2QbrARy7M",
    "2024-01": "1AAVowr7NFIU20Tshwpt5Xju6hNiEwV1k",
    "2024-02": "1VkLFGzsGyD_STU_wOTxwqMbEEuZNUu9K",
    "2024-03": "1OwZ56kXX7OpkzL8n3V2GwI_nW3JHKEM2",
    "2024-04": "1K8f2a6LI2vO5eywoViTUdOFJpozKn8ky",
    "2024-05": "1fhbJrgPswDc7inKzrFATDtWpmq79fVlF",
    "2024-06": "1bb3EWcQbr8SV_ZcQcRbsr2aa2f2Cg_1M",
    "2024-07": "1jk-1Sn-02Hajwv2F_4Z6i_WOWnn6k3nb",
    "2024-08": "1Wo0b7o0QPs-sN_hQiQf_Ob3d60lvvXLG",
    "2024-09": "1ahbgp6BYZ-8UrbfOApeGXm95SdqNqNPu",
    "2024-10": "1200PFPmNVh9tATIAOb3I_HKjIQ-B_Dhy",
    "2024-11": "1TsP2tKOoZATo-5pvwt19Dxw833_jzLTw",
    "2024-12": "1HfMS2G1r-1LvfSZ2sf_dN2xyaG7vxjgt",
    "2025-01": "10uJSARdkROWIV6jqugMWlVS8TQyhmxpU",
    "2025-02": "1bB-EG1fBRFWz7C_bCNg7KE622YMEs-wG",
    "2025-03": "1pf2nZ52n5ktjvhdwblnoi_QHeF5CFd0U",
    "2025-04": "1BStge3wWNhOh45EE5W97ZMerMroo85vz",
    "2025-05": "1dGe6PVUIA9nzuNcfk09GhZ08wVv6Xces",
    "2025-06": "12PxUgZQxyQ4Lc6sT8WmxqHI8hKetcdS4",
    "2025-07": "1DG1BU2FqXgsLNqi7CSavbjCgOduhOtZP",
    "2025-08": "1nP1ACq7e_ozNSXMYtt0PYsZowG7a6wnJ",
    "2025-09": "1X7Yvi5pHBovwmWwcK376nw2Ra3Dd-ucG",
    "2025-10": "1N1fWr_-7cL3EJS5tjkmlOW1jnEXU0Gmh",
    "2025-11": "1EU06h0G9T4r_cB-QWTJaFbSh6uJ8QHyc",
    "2025-12": "18tk2uB73LyZGFsY7jFU8JWDp68RplWyI",
  };
  // ym -> id de carpeta de Drive (Diseño de interiores: …6474 + …6482)
  const PR = {
    "2023-12": "1qHC6aWqTMwy-HqgLXlppWgryFOu-4ygH",
    "2024-01": "1ON_xmvbtKX6O5HVbv1iSx3jn5r1USSda",
    "2024-02": "1GaOwQaoGdCPVkY-YNTJr0nji1J-G4itH",
    "2024-03": "1OtKwOwkmaOxHurb9c0Z7fC3SszCgNoC1",
    "2024-04": "1jXNZcg_TizkFS-JrH8uy0jTkshsZfOVN",
    "2024-05": "1gBnqFBmC1TxsGrdu7otwdOf-ksYn34oc",
    "2024-06": "1_IIoZJCvnu09fLiuHSOKqMJwfCMUL5Oh",
    "2024-07": "1kq68Cnay0N0rMnkp5nfgOgLDszzIlXd_",
    "2024-08": "1Os60btCwSHkHHuKvOL6VeaVvLoESf78p",
    "2024-09": "1vOz0OeHoODuM8_yVKhj2VnfixDRmCRZl",
    "2024-10": "1q_RDclUuZfgi3YfNmfe4d-Rt_rlNPyvQ",
    "2024-11": "15s0qNHetV6xBN2gzRWA5Glo_FrYC1DF7",
    "2024-12": "1UsVxhASFUePwVU95SYvnqGMcOdR5Sgli",
    "2025-01": "1JAtdTvvhQ0mI88ixzy9sZIvr5cG-iPg7",
    "2025-02": "1ZnEqrNXQjzC-WGmVO-5Yj2O10bWn9cil",
    "2025-03": "1JFZ7AyD-kRvy63NKJtCrbF9ktytFCiir",
    "2025-04": "1myHD-w1NdoazO0BufjdJwYJ6kTDhzJwT",
    "2025-05": "1JERaaS0PhJ4mMg-0jO5Wo8Elq4oYAb82",
    "2025-06": "1zO_bPh_AIWLmLP9Fu-A-5QRZ8yJoaxke",
    "2025-07": "1yaLOKhVRKyoPipbHwVcGBhwSL6iJyC_5",
    "2025-08": "1ohk5LrIZp9YwpK8o-3OAWrY19BQn7aLz",
    "2025-09": "1fVPTyJ4KdFUyHdGSdyZ8JrH10TPjpxY5",
    "2025-10": "1uI_wci6hf6Eim4vIrII7VwJ22mAEu5eS",
    "2025-11": "1p6Su6KAR7wziB8ma_ZklcN9b-y7f621r",
    "2025-12": "1XRuIepYKQ8Ckgo7jI8Ca6t-zuXw7depF",
  };

  const folderUrl = (id) => "https://drive.google.com/drive/folders/" + id;

  // [{ label, url }] de las carpetas con PDFs originales para ese mes
  function folders(ym) {
    const out = [];
    if (OP[ym]) out.push({ label: "Cuentas Operativas (GTQ + USD)", url: folderUrl(OP[ym]) });
    if (PR[ym]) out.push({ label: "Diseño de interiores (GTQ + USD)", url: folderUrl(PR[ym]) });
    return out;
  }
  function months() {
    const s = {};
    Object.keys(OP).forEach(m => s[m] = 1);
    Object.keys(PR).forEach(m => s[m] = 1);
    return Object.keys(s).sort().reverse();
  }

  window.SpacioContaArchive = { folders, months, OP, PR };
})();
