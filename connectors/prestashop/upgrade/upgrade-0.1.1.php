<?php

if (!defined('_PS_VERSION_')) {
    exit;
}

function upgrade_module_0_1_1($module)
{
    $table = _DB_PREFIX_ . 'pdeca_order_sync';
    $column = Db::getInstance()->getRow(
        "SHOW COLUMNS FROM `" . bqSQL($table) . "` LIKE 'access_url'"
    );

    if (!is_array($column)) {
        return (bool) Db::getInstance()->execute(
            'ALTER TABLE `' . bqSQL($table) . '` '
            . 'ADD `access_url` TEXT NULL AFTER `document_id`'
        );
    }

    return true;
}
