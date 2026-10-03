<?php

if (!defined('_PS_VERSION_')) {
    exit;
}

final class PDECAPrestaShopSecretStore
{
    const CONFIG_KEY = 'PDECA_PS_API_KEY';

    private static function key()
    {
        return hash(
            'sha256',
            (string) _COOKIE_KEY_ . '|' . (string) _COOKIE_IV_ . '|puente-deca',
            true
        );
    }

    public static function set($secret, $shopId)
    {
        $secret = trim((string) $secret);
        if ($secret === '') {
            return self::delete($shopId);
        }

        $key = self::key();

        if (function_exists('sodium_crypto_secretbox')) {
            $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
            $cipher = sodium_crypto_secretbox($secret, $nonce, $key);

            return Configuration::updateValue(
                self::CONFIG_KEY,
                'sodium:' . base64_encode($nonce . $cipher),
                false,
                null,
                (int) $shopId
            );
        }

        if (function_exists('openssl_encrypt')) {
            $iv = random_bytes(12);
            $tag = '';
            $cipher = openssl_encrypt(
                $secret,
                'aes-256-gcm',
                $key,
                OPENSSL_RAW_DATA,
                $iv,
                $tag
            );

            if ($cipher === false) {
                return false;
            }

            return Configuration::updateValue(
                self::CONFIG_KEY,
                'openssl:' . base64_encode($iv . $tag . $cipher),
                false,
                null,
                (int) $shopId
            );
        }

        return false;
    }

    public static function get($shopId)
    {
        $stored = (string) Configuration::get(
            self::CONFIG_KEY,
            null,
            null,
            (int) $shopId
        );

        if ($stored === '') {
            return '';
        }

        try {
            if (
                strpos($stored, 'sodium:') === 0
                && function_exists('sodium_crypto_secretbox_open')
            ) {
                $raw = base64_decode(substr($stored, 7), true);
                if (
                    $raw === false
                    || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES
                ) {
                    return '';
                }

                $nonce = substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
                $cipher = substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
                $plain = sodium_crypto_secretbox_open(
                    $cipher,
                    $nonce,
                    self::key()
                );

                return $plain === false ? '' : $plain;
            }

            if (
                strpos($stored, 'openssl:') === 0
                && function_exists('openssl_decrypt')
            ) {
                $raw = base64_decode(substr($stored, 8), true);
                if ($raw === false || strlen($raw) <= 28) {
                    return '';
                }

                $iv = substr($raw, 0, 12);
                $tag = substr($raw, 12, 16);
                $cipher = substr($raw, 28);
                $plain = openssl_decrypt(
                    $cipher,
                    'aes-256-gcm',
                    self::key(),
                    OPENSSL_RAW_DATA,
                    $iv,
                    $tag
                );

                return $plain === false ? '' : $plain;
            }
        } catch (Throwable $error) {
            return '';
        }

        return '';
    }

    public static function delete($shopId)
    {
        return Configuration::updateValue(
            self::CONFIG_KEY,
            '',
            false,
            null,
            (int) $shopId
        );
    }
}
