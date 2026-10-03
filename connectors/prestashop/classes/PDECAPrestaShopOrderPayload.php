<?php

if (!defined('_PS_VERSION_')) {
    exit;
}

final class PDECAPrestaShopOrderPayload
{
    private static function addressText($addressId)
    {
        $address = new Address((int) $addressId);
        if (!Validate::isLoadedObject($address)) {
            return '';
        }

        $parts = array_filter(
            array(
                $address->address1,
                $address->address2,
                $address->postcode,
                $address->city,
                State::getNameById((int) $address->id_state),
                Country::getIsoById((int) $address->id_country),
            ),
            function ($value) {
                return trim((string) $value) !== '';
            }
        );

        return implode(
            ', ',
            array_map(
                function ($value) {
                    return trim(strip_tags((string) $value));
                },
                $parts
            )
        );
    }

    private static function goodsNature(Order $order)
    {
        $names = array();

        foreach ($order->getProducts() as $product) {
            $name = isset($product['product_name'])
                ? trim((string) $product['product_name'])
                : '';

            if ($name !== '') {
                $names[] = $name;
            }
        }

        return implode('; ', array_values(array_unique($names)));
    }

    private static function convertWeightToKg($value, $unit)
    {
        if (!is_numeric($value) || (float) $value <= 0) {
            return null;
        }

        $weight = (float) $value;
        $unit = strtolower(trim((string) $unit));

        if (in_array($unit, array('kg', 'kgs', 'kilogram', 'kilograms'), true)) {
            return $weight;
        }
        if (in_array($unit, array('g', 'gram', 'grams'), true)) {
            return $weight / 1000;
        }
        if (in_array($unit, array('lb', 'lbs', 'pound', 'pounds'), true)) {
            return $weight * 0.45359237;
        }
        if (in_array($unit, array('oz', 'ounce', 'ounces'), true)) {
            return $weight * 0.028349523125;
        }

        return null;
    }

    private static function weightKg(Order $order, array $logistics)
    {
        if (
            isset($logistics['weight_kg'])
            && trim((string) $logistics['weight_kg']) !== ''
            && is_numeric(str_replace(',', '.', (string) $logistics['weight_kg']))
        ) {
            $override = (float) str_replace(
                ',',
                '.',
                (string) $logistics['weight_kg']
            );

            return $override > 0 ? round($override, 3) : null;
        }

        $unit = (string) Configuration::get('PS_WEIGHT_UNIT');
        $total = 0.0;

        foreach ($order->getProducts() as $product) {
            $weight = isset($product['product_weight'])
                ? $product['product_weight']
                : null;
            $quantity = isset($product['product_quantity'])
                ? max(1, (int) $product['product_quantity'])
                : 1;
            $kg = self::convertWeightToKg($weight, $unit);

            if ($kg === null) {
                return null;
            }

            $total += $kg * $quantity;
        }

        return $total > 0 ? round($total, 3) : null;
    }

    private static function logisticsValue(array $logistics, $key)
    {
        return isset($logistics[$key])
            ? trim((string) $logistics[$key])
            : '';
    }

    public static function build(Order $order, array $settings, array $logistics)
    {
        $weight = self::weightKg($order, $logistics);
        $carrierName = self::logisticsValue($logistics, 'carrier_name');
        $carrierTaxId = self::logisticsValue($logistics, 'carrier_tax_id');

        if ($carrierName === '') {
            $carrierName = trim((string) $settings['carrier_name']);
        }
        if ($carrierTaxId === '') {
            $carrierTaxId = trim((string) $settings['carrier_tax_id']);
        }

        $trailer = self::logisticsValue(
            $logistics,
            'trailer_registration'
        );
        $special = self::logisticsValue(
            $logistics,
            'special_authorization'
        );

        $goods = array(
            'nature' => self::goodsNature($order),
        );

        if ($weight !== null) {
            $goods['weight'] = array(
                'value' => $weight,
                'unit' => 'kg',
            );
        }

        return array(
            'externalReference' => sprintf(
                'prestashop:%d:order:%d',
                (int) $order->id_shop,
                (int) $order->id
            ),
            'contractualShipper' => array(
                'legalName' => trim((string) $settings['shipper_name']),
                'taxId' => trim((string) $settings['shipper_tax_id']),
                'address' => trim((string) $settings['shipper_address']),
            ),
            'effectiveCarrier' => array(
                'legalName' => $carrierName,
                'taxId' => $carrierTaxId,
            ),
            'route' => array(
                'origin' => trim((string) $settings['origin']),
                'destination' => self::addressText(
                    (int) $order->id_address_delivery > 0
                        ? (int) $order->id_address_delivery
                        : (int) $order->id_address_invoice
                ),
            ),
            'goods' => $goods,
            'transport' => array(
                'date' => self::logisticsValue(
                    $logistics,
                    'transport_date'
                ),
                'vehicle' => array(
                    'tractorRegistration' => self::logisticsValue(
                        $logistics,
                        'tractor_registration'
                    ),
                    'trailerRegistration' => $trailer === ''
                        ? null
                        : $trailer,
                ),
                'specialTrafficAuthorization' => $special === ''
                    ? null
                    : $special,
            ),
            'observations' => null,
        );
    }
}
