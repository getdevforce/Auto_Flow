<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class SupportReply extends Mailable
{
    public function __construct(public readonly string $body) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Re: your message to '.config('brand.name'));
    }

    public function content(): Content
    {
        return new Content(text: 'mail.support-reply');
    }
}
