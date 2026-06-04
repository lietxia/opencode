CREATE TABLE `session_context_epoch` (
	`session_id` text PRIMARY KEY,
	`baseline` text NOT NULL,
	`checkpoint` text NOT NULL,
	`baseline_seq` integer NOT NULL,
	`replacement_seq` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_session_context_epoch_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session_context_message` (
	`session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`parts` text NOT NULL,
	CONSTRAINT `session_context_message_pk` PRIMARY KEY(`session_id`, `seq`),
	CONSTRAINT `fk_session_context_message_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
