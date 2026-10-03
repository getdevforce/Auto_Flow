<?php

namespace App\Enums;

enum StaffRole: string
{
    case SuperAdmin = 'super_admin';
    case Editor = 'editor';
    case Support = 'support';
    case Analyst = 'analyst';
}
