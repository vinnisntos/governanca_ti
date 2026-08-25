"use client";

import * as React from "react";
import { addTicketMessageAction } from "../actions";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";

const MESSAGE_MAX = 4000;

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const [message, setMessage] = React.useState("");

  return (
    <form action={addTicketMessageAction} className="space-y-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <Field
        label="Sua mensagem"
        htmlFor="message"
        hint={`${message.length}/${MESSAGE_MAX}`}
      >
        <Textarea
          id="message"
          name="message"
          rows={3}
          required
          maxLength={MESSAGE_MAX}
          placeholder="Escreva uma resposta..."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="primary" size="sm" pendingLabel="Enviando...">
          Enviar mensagem
        </SubmitButton>
      </div>
    </form>
  );
}
