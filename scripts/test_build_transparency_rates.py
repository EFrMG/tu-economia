"""Tests for the Tasas build. Run with `python3 -m unittest discover -s scripts`."""

import datetime as dt
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("build_transparency_rates", Path(__file__).with_name("build-transparency-rates.py"))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

TODAY = dt.date(2026, 11, 12)


def loan(**overrides):
    row = {
        "montoMinimoOtorgable": 1000,
        "denominacion": "Pesos",
        "montoMaximoOtorgable": 30400000,
        "plazoMaximoOtorgable": 72,
        "ingresoMinimoMensual": 310000,
        "beneficiario": "Todos los beneficiarios",
        "tasaEfectivaAnualMaxima": 74.69,
        "tipoTasa": "Fija",
        "costoFinancieroEfectivoTotalMaximo": 95.77,
        "codigoEntidad": 7,
        "descripcionEntidad": "BANCO DE GALICIA Y BUENOS AIRES S.A.",
        "fechaInformacion": "2026-09-03",
        "nombreCompleto": "PRESTAMOPERSONALMINIMOPLUS",
        "territorioValidez": "0",
    }

    return {**row, **overrides}


def card(**overrides):
    row = {
        "comisionMaximaAdministracionMantenimiento": 27500.0,
        "comisionMaximaRenovacion": 163500.0,
        "tasaEfectivaAnualMaximaFinanciacion": 105.81,
        "tasaEfectivaAnualMaximaAdelantoEfectivo": 105.81,
        "segmento": "Internacional",
        "codigoEntidad": 7,
        "descripcionEntidad": "BANCO DE GALICIA Y BUENOS AIRES S.A.",
        "fechaInformacion": "2026-10-15",
        "nombreCompleto": "VISA INTERNACIONAL",
        "territorioValidez": "Todo el territorio nacional",
    }

    return {**row, **overrides}


class ProvinceTest(unittest.TestCase):
    def test_loan_codes_follow_the_alphabetical_list_with_ch_after_c(self):
        self.assertEqual(build.loan_provinces("0"), [])
        self.assertEqual(build.loan_provinces("1"), ["caba"])
        self.assertEqual(build.loan_provinces("6"), ["chaco"])
        self.assertEqual(build.loan_provinces("24"), ["tucuman"])
        self.assertIsNone(build.loan_provinces("25"))
        self.assertIsNone(build.loan_provinces(None))

    def test_card_names_match_with_or_without_the_province_prefix(self):
        self.assertEqual(build.card_provinces("Todo el territorio nacional"), [])
        self.assertEqual(build.card_provinces("Provincia del Neuquén"), ["neuquen"])
        self.assertEqual(build.card_provinces("Ciudad Autónoma de Buenos Aires"), ["caba"])
        self.assertEqual(build.card_provinces("Provincia de Tierra del Fuego Antártida e Islas del Atlántico Sur"), ["tierra-del-fuego"])
        self.assertIsNone(build.card_provinces("Montevideo"))


class LoanTest(unittest.TestCase):
    def test_keeps_a_valid_pesos_loan_with_its_figures(self):
        rows, excluded = build.build_loans([loan()], TODAY)

        self.assertEqual(excluded, {})
        self.assertEqual(rows[0]["cft"], 95.77)
        self.assertEqual(rows[0]["beneficiary"], "todos")
        self.assertEqual(rows[0]["rateType"], "fija")
        self.assertEqual(rows[0]["provinces"], [])

    def test_counts_each_reason_for_leaving_a_row_out(self):
        rows, excluded = build.build_loans(
            [
                loan(denominacion="Dólares estadounidenses"),
                loan(denominacion="Dolares estadounidenses"),
                loan(denominacion=None),
                loan(nombreCompleto="PRESTAMO PERSONAL UVA"),
                loan(fechaInformacion="2025-11-11"),
                loan(costoFinancieroEfectivoTotalMaximo=build.MAX_RATE + 0.01),
                loan(costoFinancieroEfectivoTotalMaximo=45839.0),
                loan(tasaEfectivaAnualMaxima=0),
                loan(plazoMaximoOtorgable="72"),
                loan(beneficiario="Turistas"),
            ],
            TODAY,
        )

        self.assertEqual(rows, [])
        self.assertEqual(excluded, {"notPesos": 4, "stale": 1, "outOfRange": 3, "invalid": 2})

    def test_keeps_short_term_credit_priced_in_the_thousands(self):
        rows, _ = build.build_loans([loan(tasaEfectivaAnualMaxima=3346.06, costoFinancieroEfectivoTotalMaximo=6115.31)], TODAY)

        self.assertEqual(len(rows), 1)

    def test_twelve_calendar_months_is_the_oldest_date_kept(self):
        rows, _ = build.build_loans([loan(fechaInformacion="2025-11-12")], TODAY)

        self.assertEqual(len(rows), 1)

    def test_rows_differing_only_in_province_become_one(self):
        rows, _ = build.build_loans([loan(territorioValidez="24"), loan(territorioValidez="1"), loan(territorioValidez="6")], TODAY)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["provinces"], ["caba", "chaco", "tucuman"])

    def test_a_nationwide_row_covers_the_provincial_ones(self):
        rows, _ = build.build_loans([loan(territorioValidez="4"), loan(territorioValidez="0")], TODAY)

        self.assertEqual(rows[0]["provinces"], [])

    def test_different_figures_stay_separate_rows(self):
        rows, _ = build.build_loans([loan(), loan(costoFinancieroEfectivoTotalMaximo=120.0)], TODAY)

        self.assertEqual(len(rows), 2)


class CardTest(unittest.TestCase):
    def test_placeholder_fees_and_missing_cash_advance_rates_read_as_not_informed(self):
        rows, _ = build.build_cards(
            [card(comisionMaximaRenovacion=999999.99, comisionMaximaAdministracionMantenimiento=999999, tasaEfectivaAnualMaximaAdelantoEfectivo=0)],
            TODAY,
        )

        self.assertIsNone(rows[0]["renewalFee"])
        self.assertIsNone(rows[0]["maintenanceFee"])
        self.assertIsNone(rows[0]["cashAdvanceTea"])
        self.assertEqual(rows[0]["financingTea"], 105.81)

    def test_segments_merge_black_and_signature(self):
        rows, _ = build.build_cards([card(segmento="Premium signature, black o similar"), card(segmento=None, nombreCompleto="OTRA")], TODAY)

        self.assertEqual(sorted(str(row["segment"]) for row in rows), ["None", "signature-black"])

    def test_a_card_without_a_financing_rate_or_territory_is_left_out(self):
        rows, excluded = build.build_cards(
            [card(tasaEfectivaAnualMaximaFinanciacion=0), card(territorioValidez=None), card(nombreCompleto=None)],
            TODAY,
        )

        self.assertEqual(rows, [])
        self.assertEqual(excluded, {"outOfRange": 1, "invalid": 2})


class DateTest(unittest.TestCase):
    def test_months_before_clamps_to_the_end_of_a_shorter_month(self):
        self.assertEqual(build.months_before(dt.date(2026, 3, 31), 1), dt.date(2026, 2, 28))
        self.assertEqual(build.months_before(dt.date(2026, 11, 12), 12), dt.date(2025, 11, 12))
        self.assertEqual(build.months_before(dt.date(2026, 1, 15), 1), dt.date(2025, 12, 15))


class UrlTest(unittest.TestCase):
    def test_only_https_on_the_bcra_api_host_is_allowed(self):
        self.assertEqual(build.check_url("https://api.bcra.gob.ar/transparencia/v1.0/TarjetasCredito"), "https://api.bcra.gob.ar/transparencia/v1.0/TarjetasCredito")

        for url in ("http://api.bcra.gob.ar/x", "https://example.com/x", "https://api.bcra.gob.ar.example.com/x"):
            with self.assertRaises(SystemExit):
                build.check_url(url)


if __name__ == "__main__":
    unittest.main()
